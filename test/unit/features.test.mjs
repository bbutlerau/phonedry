/**
 * Tests for the features and traits mapper.
 *
 * Run with `npm run test:unit`. The items here are shaped like the real ones on
 * the development world's cleric, whose feature list is unusually good for this:
 * it has passives with no activities at all (Spellcasting, Observant), a passive
 * that carries a subtype (Channel Divinity features), and two features whose
 * only activities have no activation type — which the actions screen *does*
 * show, and which therefore must not appear here.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { buildActionGroups } from "../../scripts/data/actions.mjs";
import {
  buildDefences, buildFeatureGroups, buildFeaturesView, buildProficiencies,
  describeFeature, flattenLanguages, isPassiveFeature, labelTrait
} from "../../scripts/data/features.mjs";

/**
 * A stand-in for CONFIG.DND5E, carrying only what the mappers read.
 *
 * `passive` marks an activation the player never triggers, which is what makes
 * a feature with activities still belong on this screen.
 */
const CONFIG_DND5E = {
  activityActivationTypes: {
    action: { label: "Action", header: "Actions" },
    reaction: { label: "Reaction", header: "Reactions" },
    shortRest: { label: "Short Rest", passive: true }
  },
  featureTypes: {
    class: { label: "Class Feature", subtypes: { channelDivinity: "Channel Divinity" } },
    race: { label: "Species Feature" },
    feat: { label: "Feat", subtypes: { general: "General Feat", origin: "Origin Feat" } },
    background: { label: "Background Feature" }
  },
  damageTypes: {
    radiant: { label: "Radiant" },
    fire: { label: "Fire" },
    bludgeoning: { label: "Bludgeoning" }
  },
  conditionTypes: {
    charmed: { name: "Charmed" },
    frightened: { name: "Frightened" }
  },
  itemProperties: {
    mgc: { label: "Magical" },
    ada: { label: "Adamantine" }
  },
  armorProficiencies: { lgt: "Light", med: "Medium", hvy: "Heavy", shl: "Shields" },
  weaponProficiencies: { sim: "Simple", mar: "Martial" },

  // The one trait config that is a tree rather than a flat map.
  languages: {
    standard: {
      label: "Standard Languages",
      children: { common: "Common", draconic: "Draconic", dwarvish: "Dwarvish" }
    },
    exotic: {
      label: "Rare Languages",
      children: { abyssal: "Abyssal" }
    }
  },
  actorSizes: { sm: { label: "Small" }, med: { label: "Medium" } }
};

/**
 * A feat item, shaped like dnd5e's.
 *
 * @param {object} [overrides]
 * @returns {object}
 */
function feature({
  id = "f1", name = "Spellcasting", type = "feat", value = "class", subtype = "",
  activations = [], uses = {}, requirements = ""
} = {}) {
  return {
    id,
    name,
    type,
    img: "icons/svg/upgrade.svg",
    system: {
      type: { value, subtype },
      uses,
      requirements,
      activities: {
        contents: activations.map((activation, i) => ({
          id: `a${i}`, name: "Use", activation: { type: activation }, labels: {}
        }))
      }
    }
  };
}

/* -------------------------------------------- */

describe("isPassiveFeature", () => {
  it("takes a feature with nothing to activate", () => {
    assert.equal(isPassiveFeature(feature(), CONFIG_DND5E), true);
  });

  it("leaves a feature the actions screen shows", () => {
    // Radiance of the Dawn is an action. Listing it here as well would be the
    // same feature in two places under two different promises.
    const radiance = feature({ name: "Radiance of the Dawn", activations: ["action"] });
    assert.equal(isPassiveFeature(radiance, CONFIG_DND5E), false);
  });

  it("takes a feature whose only activation is one dnd5e calls passive", () => {
    // Something that happens on a short rest is not a thing the player does, so
    // the actions screen skips it — and without this it would fall between the
    // two screens and be invisible.
    const recharge = feature({ name: "Recharger", activations: ["shortRest"] });
    assert.equal(isPassiveFeature(recharge, CONFIG_DND5E), true);
  });

  it("leaves a feature with no activation type, which the actions screen groups as other", () => {
    /*
     * dnd5e leaves the type empty for riders like Divine Strike — extra damage
     * applied when something else has happened. The actions screen puts those
     * in its catch-all group, so they are not passive.
     */
    const strike = feature({ name: "Divine Strike", activations: ["", ""] });
    assert.equal(isPassiveFeature(strike, CONFIG_DND5E), false);
  });

  it("takes only feat items", () => {
    // The class, subclass, species and background items are the containers
    // rather than the contents. "Cleric" and "Gnome, Forest" are already named
    // in the header, and what they grant arrives as separate feat items.
    for ( const type of ["class", "subclass", "race", "background", "weapon", "spell"] ) {
      assert.equal(isPassiveFeature(feature({ type }), CONFIG_DND5E), false, type);
    }
  });
});

/* -------------------------------------------- */

describe("the partition with the actions screen", () => {
  /**
   * Every feature is on exactly one of the two screens.
   *
   * This is the correctness condition rather than a nicety. Before this screen
   * existed, a feature with no activity appeared nowhere at all — and the way
   * that comes back is the two mappers disagreeing about what "passive" means,
   * which is why this screen imports the actions screen's own test rather than
   * restating it.
   */
  const items = [
    feature({ id: "a", name: "Spellcasting" }),
    feature({ id: "b", name: "Observant", value: "feat", subtype: "general" }),
    feature({ id: "c", name: "Radiance of the Dawn", activations: ["action"] }),
    feature({ id: "d", name: "Warding Flare", activations: ["reaction"] }),
    feature({ id: "e", name: "Divine Strike", activations: ["", ""] }),
    feature({ id: "f", name: "Recharger", activations: ["shortRest"] })
  ];

  it("shows every feature exactly once across the two screens", () => {
    /*
     * Compared by item id rather than by name. An actions row for an item with
     * several activities is named after the *activity* — three Channel Divinity
     * rows have to be told apart somehow — so the item's own name is not on
     * screen there, and matching on it would find a gap that is not one.
     */
    const onFeatures = new Set(buildFeatureGroups(items, CONFIG_DND5E)
      .flatMap(group => group.entries.map(e => e.id)));

    const onActions = new Set(buildActionGroups(items, CONFIG_DND5E)
      .flatMap(group => group.entries.map(e => e.itemId)));

    for ( const item of items ) {
      const here = onFeatures.has(item.id);
      const there = onActions.has(item.id);

      assert.equal(here || there, true, `${item.name} appears on neither screen`);
      assert.equal(here && there, false, `${item.name} appears on both screens`);
    }
  });
});

/* -------------------------------------------- */

describe("describeFeature", () => {
  it("names the subtype where it says something the heading does not", () => {
    const row = describeFeature(
      feature({ name: "Sear Undead", value: "class", subtype: "channelDivinity" }),
      CONFIG_DND5E
    );

    assert.equal(row.subtitle, "Channel Divinity");
    assert.equal(row.group, "class");
  });

  it("says nothing where dnd5e recorded no subtype", () => {
    assert.equal(describeFeature(feature(), CONFIG_DND5E).subtitle, null);
  });

  it("carries a pool where a passive has one", () => {
    // A feature that recharges on a rest lands on this screen rather than the
    // actions one, and its remaining uses are still worth seeing.
    const row = describeFeature(feature({ uses: { value: 1, max: 2 } }), CONFIG_DND5E);
    assert.deepEqual(row.uses, { value: 1, max: 2 });

    assert.equal(describeFeature(feature(), CONFIG_DND5E).uses, null);
  });
});

/* -------------------------------------------- */

describe("buildFeatureGroups", () => {
  it("groups by where a feature came from, class first", () => {
    const groups = buildFeatureGroups([
      feature({ id: "a", name: "Skilled", value: "feat" }),
      feature({ id: "b", name: "Scribe", value: "background" }),
      feature({ id: "c", name: "Spellcasting", value: "class" }),
      feature({ id: "d", name: "Gnomish Cunning", value: "race" })
    ], CONFIG_DND5E);

    assert.deepEqual(groups.map(g => g.type), ["class", "race", "feat", "background"]);
    assert.deepEqual(groups.map(g => g.label),
      ["Class Feature", "Species Feature", "Feat", "Background Feature"]);
  });

  it("sorts alphabetically within a group", () => {
    // The order features were added in is the order they were levelled into,
    // which nobody remembers and cannot be navigated by on a phone.
    const [group] = buildFeatureGroups([
      feature({ id: "a", name: "Warding Flare" }),
      feature({ id: "b", name: "Blessed Strikes" }),
      feature({ id: "c", name: "Divine Order" })
    ], CONFIG_DND5E);

    assert.deepEqual(group.entries.map(e => e.name),
      ["Blessed Strikes", "Divine Order", "Warding Flare"]);
  });

  it("puts an unknown feature type at the end rather than dropping it", () => {
    const groups = buildFeatureGroups([
      feature({ id: "a", name: "Strange", value: "homebrew" }),
      feature({ id: "b", name: "Ordinary", value: "class" })
    ], CONFIG_DND5E);

    assert.deepEqual(groups.map(g => g.type), ["class", "homebrew"]);

    // Falls back to the key rather than showing an empty heading.
    assert.equal(groups[1].label, "homebrew");
  });
});

/* -------------------------------------------- */

describe("labelTrait", () => {
  it("reads a name from whichever field the config uses for it", () => {
    // dnd5e is not consistent: damage types keep their name under `label`,
    // conditions under `name`, and proficiencies are plain strings.
    assert.deepEqual(labelTrait(["radiant"], CONFIG_DND5E.damageTypes), ["Radiant"]);
    assert.deepEqual(labelTrait(["charmed"], CONFIG_DND5E.conditionTypes), ["Charmed"]);
    assert.deepEqual(labelTrait(["sim"], CONFIG_DND5E.weaponProficiencies), ["Simple"]);
  });

  it("falls back to the key rather than showing nothing", () => {
    assert.deepEqual(labelTrait(["homebrewType"], CONFIG_DND5E.damageTypes), ["homebrewType"]);
  });

  it("includes whatever the GM typed by hand", () => {
    // Semicolons are dnd5e's separator here, not commas — a custom entry may
    // well contain a comma of its own.
    assert.deepEqual(
      labelTrait(["fire"], CONFIG_DND5E.damageTypes, "Silvered weapons; Cold, but only at night"),
      ["Cold, but only at night", "Fire", "Silvered weapons"]
    );
  });

  it("accepts a Set, which is how dnd5e stores these", () => {
    assert.deepEqual(labelTrait(new Set(["fire", "radiant"]), CONFIG_DND5E.damageTypes),
      ["Fire", "Radiant"]);
  });

  it("survives having nothing at all", () => {
    assert.deepEqual(labelTrait(), []);
    assert.deepEqual(labelTrait(undefined, undefined, undefined), []);
  });
});

/* -------------------------------------------- */

describe("flattenLanguages", () => {
  it("takes the leaves and drops the group headings", () => {
    // Standard and Rare are headings a player cannot speak.
    const flat = flattenLanguages(CONFIG_DND5E.languages);

    assert.equal(flat.common, "Common");
    assert.equal(flat.abyssal, "Abyssal");
    assert.equal(flat.standard, undefined);
    assert.equal(flat.exotic, undefined);
  });

  it("reaches a dialect nested a further level down", () => {
    const flat = flattenLanguages({
      exotic: { label: "Rare", children: {
        primordial: { label: "Primordial", children: { auran: "Auran" } }
      } }
    });

    assert.equal(flat.auran, "Auran");
  });
});

/* -------------------------------------------- */

describe("buildDefences", () => {
  const traits = {
    dr: { value: new Set(["radiant"]), custom: "", bypasses: new Set() },
    di: { value: new Set(), custom: "", bypasses: new Set() },
    dv: { value: new Set(), custom: "", bypasses: new Set() },
    ci: { value: new Set(["charmed"]), custom: "" }
  };

  it("shows all four rows once any of them has something", () => {
    /*
     * Together, an empty row is a definite "none". Individually it would be
     * ambiguous — a missing "Resistances" could mean the character resists
     * nothing or that the sheet does not show resistances, and on the screen
     * checked before taking damage that difference matters.
     */
    const rows = buildDefences(traits, CONFIG_DND5E);

    assert.equal(rows.length, 4);
    assert.deepEqual(rows[0].values, ["Radiant"]);
    assert.deepEqual(rows[1].values, []);
    assert.deepEqual(rows[3].values, ["Charmed"]);
  });

  it("shows nothing at all when the character has none of any of them", () => {
    // Four em-dashes in a row say nothing worth the space on a phone.
    assert.deepEqual(buildDefences({
      dr: { value: new Set() }, di: { value: new Set() },
      dv: { value: new Set() }, ci: { value: new Set() }
    }, CONFIG_DND5E), []);

    assert.deepEqual(buildDefences({}, CONFIG_DND5E), []);
  });

  it("says what gets through anyway", () => {
    // A resistance magical weapons ignore is a materially different fact from
    // one nothing ignores.
    const rows = buildDefences({
      dr: { value: new Set(["bludgeoning"]), bypasses: new Set(["mgc", "ada"]) }
    }, CONFIG_DND5E);

    assert.deepEqual(rows[0].bypasses, ["Adamantine", "Magical"]);
  });
});

/* -------------------------------------------- */

describe("buildProficiencies", () => {
  it("lists what the character speaks and can wield", () => {
    const rows = buildProficiencies({
      languages: { value: new Set(["common", "draconic"]), custom: "" },
      armorProf: { value: new Set(["lgt", "shl"]), custom: "" },
      weaponProf: { value: new Set(["sim"]), custom: "" }
    }, CONFIG_DND5E);

    assert.deepEqual(rows.map(r => r.label), [
      "PHONEDRY.Features.Languages",
      "PHONEDRY.Features.ArmourProficiencies",
      "PHONEDRY.Features.WeaponProficiencies"
    ]);

    assert.deepEqual(rows[0].values, ["Common", "Draconic"]);
    assert.deepEqual(rows[1].values, ["Light", "Shields"]);
  });

  it("leaves out a row with nothing in it", () => {
    // A wizard with no armour proficiency should not get an empty armour row;
    // unlike the defences, these are not read as a block.
    const rows = buildProficiencies({
      languages: { value: new Set(["common"]) },
      armorProf: { value: new Set() }
    }, CONFIG_DND5E);

    assert.deepEqual(rows.map(r => r.label), ["PHONEDRY.Features.Languages"]);
  });
});

/* -------------------------------------------- */

describe("buildFeaturesView", () => {
  const actor = {
    items: [feature({ name: "Spellcasting" })],
    system: {
      traits: {
        size: "sm",
        languages: { value: new Set(["common"]) },
        armorProf: { value: new Set(["lgt"]) },
        dr: { value: new Set(["radiant"]) }
      }
    }
  };

  it("assembles the whole screen", () => {
    const view = buildFeaturesView(actor, CONFIG_DND5E);

    assert.equal(view.empty, false);
    assert.equal(view.groups.length, 1);
    assert.equal(view.defences.length, 4);
    assert.equal(view.proficiencies.length, 2);
    assert.equal(view.size, "Small");
  });

  it("lands on the empty state for a character with nothing to say", () => {
    const view = buildFeaturesView({ items: [], system: { traits: {} } }, CONFIG_DND5E);
    assert.equal(view.empty, true);
  });

  it("survives an actor with nothing on it at all", () => {
    // The template branches on the view model rather than on the actor, so a
    // mapper that threw here would be a blank screen rather than an error.
    const view = buildFeaturesView({}, CONFIG_DND5E);
    assert.equal(view.empty, true);
    assert.equal(view.size, null);
  });
});
