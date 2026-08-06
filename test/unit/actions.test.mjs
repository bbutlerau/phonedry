/**
 * Tests for the actions mapper.
 *
 * Run with `npm run test:unit`. Plain objects shaped like dnd5e's items and
 * activities, taken from real ones read out of the development world — the
 * cleric's Channel Divinity really does carry three activities over one pool of
 * uses, and the Pistol really is the only weapon equipped.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  buildActionGroups, buildActionsView, describeActivity, describeSpellAction,
  isPassiveActivation, itemOffersActions, mergeEntries, OTHER_GROUP,
  qualifyingSpellActivity, spellCrossListsOnActions
} from "../../scripts/data/actions.mjs";

/** Item type names, as core supplies them in `CONFIG.Item.typeLabels`. */
const TYPE_LABELS = { weapon: "TYPES.Item.weapon", consumable: "TYPES.Item.consumable" };

/**
 * A stand-in for CONFIG.DND5E, carrying only what the mapper reads.
 *
 * `header` is the plural heading and `label` the singular; some types have only
 * one of the two, which is why the mapper prefers in that order. `passive`
 * marks an activation the player never triggers.
 */
const CONFIG_DND5E = {
  activityActivationTypes: {
    action: { label: "Action", header: "Actions" },
    bonus: { label: "Bonus Action", header: "Bonus Actions" },
    reaction: { label: "Reaction", header: "Reactions" },
    minute: { label: "Minutes", header: "Minutes" },
    shortRest: { label: "Short Rest", passive: true },
    turnStart: { label: "Start of Turn", passive: true }
  }
};

/**
 * An activity, shaped like dnd5e's.
 *
 * @param {object} [overrides]
 * @returns {object}
 */
function activity({
  id = "act1", name = "Attack", type = "action", activityType, img, labels = {}
} = {}) {
  return {
    id,
    name,

    // dnd5e gives an activity a generic icon for what it is, so every save
    // activity carries the same one.
    img,

    // The activity's own document type — "attack", "damage", "save" — as
    // distinct from `activation.type` below, which is when it can be used
    // rather than what kind of roll it makes. Left unset by default because
    // most of the fixtures in this file do not care; only the qualifying-spell
    // tests need it.
    ...(activityType === undefined ? {} : { type: activityType }),

    // dnd5e leaves the type an empty string for riders like Divine Strike.
    activation: { type },

    labels: { activation: "Action", range: "5 ft", damages: [], ...labels }
  };
}

/**
 * An item, shaped like dnd5e's. `activities` is a Collection on a real item;
 * the mapper only reads `.contents`, which is what this provides.
 *
 * @param {object} [overrides]
 * @returns {object}
 */
function item({
  id = "item1", name = "Mace", type = "weapon", equipped = true,
  activities = [activity()], uses = {}, source, level
} = {}) {
  return {
    id,
    name,
    type,
    img: "icons/svg/item-bag.svg",

    // Where an item was copied from. Two flasks of holy water bought together
    // share this, which is what makes them the same thing rather than two
    // things with the same name.
    ...(source === undefined ? {} : { _stats: { compendiumSource: source } }),

    system: {
      equipped, uses, activities: { contents: activities },
      ...(level === undefined ? {} : { level })
    }
  };
}

/**
 * Two stacks of the same consumable, as a character who bought a pair has.
 *
 * @param {number[]} charges  Remaining uses, one per stack.
 * @returns {object[]}
 */
function stacks(charges) {
  return charges.map((value, i) => item({
    id: `water${i}`, name: "Holy Water", type: "consumable", equipped: false,
    source: "Compendium.dnd5e.items.Item.holywater000000",
    uses: { value, max: 1 },
    activities: [activity({ id: "throw", name: "Throw" })]
  }));
}

/* -------------------------------------------- */

describe("itemOffersActions", () => {
  it("includes an equipped weapon and excludes one in the pack", () => {
    assert.equal(itemOffersActions(item({ equipped: true })), true);
    assert.equal(itemOffersActions(item({ equipped: false })), false);
  });

  it("does not require a consumable to be equipped", () => {
    // Holy water is thrown from the pack. Requiring it to be equipped first
    // would hide a real action behind a rule nobody plays by.
    const water = item({ type: "consumable", name: "Holy Water", equipped: false });
    assert.equal(itemOffersActions(water), true);
  });

  it("excludes spells, which have their own screen", () => {
    assert.equal(itemOffersActions(item({ type: "spell", equipped: true })), false);
  });

  it("excludes anything with no activities at all", () => {
    assert.equal(itemOffersActions(item({ activities: [] })), false);
    assert.equal(itemOffersActions({ id: "x", type: "loot", system: {} }), false);
  });
});

/* -------------------------------------------- */

describe("qualifyingSpellActivity", () => {
  it("qualifies a leveled spell with a bonus or reaction activation", () => {
    const smite = item({
      type: "spell", level: 1,
      activities: [activity({ id: "dmg", type: "bonus", activityType: "damage" })]
    });
    assert.equal(qualifyingSpellActivity(smite, CONFIG_DND5E)?.id, "dmg");

    const shield = item({
      type: "spell", level: 1,
      activities: [activity({ id: "save", type: "reaction", activityType: "save" })]
    });
    assert.equal(qualifyingSpellActivity(shield, CONFIG_DND5E)?.id, "save");
  });

  it("qualifies an attack cantrip, but not an attack spell with a level", () => {
    const fireBolt = item({
      type: "spell", level: 0,
      activities: [activity({ id: "atk", type: "action", activityType: "attack" })]
    });
    assert.equal(qualifyingSpellActivity(fireBolt, CONFIG_DND5E)?.id, "atk");

    const guidingBolt = item({
      type: "spell", level: 1,
      activities: [activity({ id: "atk", type: "action", activityType: "attack" })]
    });
    assert.equal(qualifyingSpellActivity(guidingBolt, CONFIG_DND5E), null);
  });

  it("does not qualify a cantrip with no attack roll, or a bonus-action buff spell", () => {
    // Most bonus-action spells are support, not reflexes — cross-listing every
    // one would crowd the screen with the duplication `itemOffersActions`
    // excludes spells to avoid in the first place.
    const light = item({
      type: "spell", level: 0,
      activities: [activity({ id: "u", type: "action", activityType: "utility" })]
    });
    assert.equal(qualifyingSpellActivity(light, CONFIG_DND5E), null);

    const heroism = item({
      type: "spell", level: 1,
      activities: [activity({ id: "u", type: "bonus", activityType: "utility" })]
    });
    // A bonus-action buff is exactly the qualifying case by the rule as
    // written — activation is what is checked for a leveled spell, not
    // purpose, because dnd5e has no field that would tell "buff" from
    // "reflex" apart. This documents that boundary rather than hiding it.
    assert.equal(qualifyingSpellActivity(heroism, CONFIG_DND5E)?.id, "u");
  });

  it("finds the qualifying activity even when it is not listed first", () => {
    // Divine Smite pairs each damage activity with an internal "forward" one;
    // this fixture instead puts a passive rider first, to prove the search
    // does not stop at the first activity regardless of what it is.
    const smite = item({
      type: "spell", level: 1,
      activities: [
        activity({ id: "rider", type: "", activityType: "damage" }),
        activity({ id: "dmg", type: "bonus", activityType: "damage" })
      ]
    });
    assert.equal(qualifyingSpellActivity(smite, CONFIG_DND5E)?.id, "dmg");
  });

  it("ignores a non-spell entirely", () => {
    assert.equal(qualifyingSpellActivity(item({ type: "feat" }), CONFIG_DND5E), null);
  });
});

describe("spellCrossListsOnActions", () => {
  it("mirrors qualifyingSpellActivity as a boolean", () => {
    const smite = item({
      type: "spell", level: 1,
      activities: [activity({ type: "bonus", activityType: "damage" })]
    });
    assert.equal(spellCrossListsOnActions(smite, CONFIG_DND5E), true);

    const light = item({ type: "spell", level: 0 });
    assert.equal(spellCrossListsOnActions(light, CONFIG_DND5E), false);
  });
});

describe("describeSpellAction", () => {
  it("names the row after the spell and routes the tap through castSpell", () => {
    const smite = item({ id: "smite1", name: "Divine Smite", type: "spell", level: 1 });
    const row = describeSpellAction(smite, activity({ id: "dmg" }));

    assert.equal(row.name, "Divine Smite");
    assert.equal(row.action, "castSpell");
    assert.equal(row.spellId, "smite1");
    assert.equal(row.itemId, "smite1");
    assert.equal(row.activityId, null);
  });

  it("reads uses from the item, the same as a feature does", () => {
    const smite = item({
      id: "smite1", type: "spell", level: 1, uses: { value: 1, max: 1 }
    });
    const row = describeSpellAction(smite, activity());
    assert.deepEqual(row.uses, { value: 1, max: 1 });
    assert.equal(row.spent, false);
  });
});

/* -------------------------------------------- */

describe("isPassiveActivation", () => {
  it("reads dnd5e's own flag rather than keeping a list", () => {
    assert.equal(isPassiveActivation("shortRest", CONFIG_DND5E), true);
    assert.equal(isPassiveActivation("action", CONFIG_DND5E), false);

    // An unknown type is not passive: a future dnd5e activation type should
    // appear on the screen rather than vanish from it.
    assert.equal(isPassiveActivation("teleport", CONFIG_DND5E), false);
    assert.equal(isPassiveActivation("", CONFIG_DND5E), false);
  });
});

/* -------------------------------------------- */

describe("describeActivity", () => {
  it("names a single-activity row after the item, not the activity", () => {
    // dnd5e calls a mace's only activity "Attack", which identifies nothing.
    const mace = item();
    const row = describeActivity(mace.system.activities.contents[0], mace, false);

    assert.equal(row.name, "Mace");
    assert.equal(row.subtitle, null);

    // Artwork follows the name: a column of identical generic glyphs is worse
    // than no icon, and the item's art is what a player recognises.
    assert.equal(row.img, "icons/svg/item-bag.svg");
    assert.equal(row.key, "item1.act1");
    assert.equal(row.itemId, "item1");
    assert.equal(row.activityId, "act1");
  });

  it("names a multi-activity row after the activity, with the item beneath", () => {
    const cd = item({ id: "cd", name: "Channel Divinity", type: "feat" });
    const row = describeActivity(
      activity({ id: "turn", name: "Turn Undead", img: "icons/svg/aura.svg" }), cd, true);

    assert.equal(row.name, "Turn Undead");
    assert.equal(row.subtitle, "Channel Divinity");

    // Here the generic icons are the only thing telling one item's rows apart.
    assert.equal(row.img, "icons/svg/aura.svg");
  });

  it("reads uses from the item, which is where a shared pool lives", () => {
    const cd = item({ id: "cd", name: "Channel Divinity", type: "feat", uses: { value: 2, max: 3 } });
    const row = describeActivity(activity(), cd, true);

    assert.deepEqual(row.uses, { value: 2, max: 3 });
    assert.equal(row.spent, false);
  });

  it("marks an exhausted pool spent, and shows no counter where there is none", () => {
    const drained = item({ uses: { value: 0, max: 3 } });
    assert.equal(describeActivity(activity(), drained, false).spent, true);

    // dnd5e leaves `max` an empty string on an item with no limited uses.
    const unlimited = item({ uses: { value: 0, max: "" } });
    assert.equal(describeActivity(activity(), unlimited, false).uses, null);
    assert.equal(describeActivity(activity(), unlimited, false).spent, false);
  });

  it("shows damage formulas rather than dnd5e's full labels", () => {
    // "1d10 + 3" fits a phone row; "1d10 + 3 Piercing" does not, and the type
    // is in the chat card one tap later.
    const row = describeActivity(activity({
      labels: {
        toHit: "+6",
        damages: [{ formula: "1d10 + 3", label: "1d10 + 3 Piercing" }]
      }
    }), item(), false);

    assert.equal(row.toHit, "+6");
    assert.equal(row.damage, "1d10 + 3");
  });

  it("joins several damage parts and reports none as null", () => {
    const both = describeActivity(activity({
      labels: { damages: [{ formula: "2d6" }, { formula: "1d8" }] }
    }), item(), false);
    assert.equal(both.damage, "2d6 + 1d8");

    assert.equal(describeActivity(activity(), item(), false).damage, null);
  });
});

/* -------------------------------------------- */

describe("buildActionGroups", () => {
  it("groups by activation and orders the groups by the shape of a turn", () => {
    const items = [
      item({ id: "flare", name: "Warding Flare", type: "feat",
        activities: [activity({ type: "reaction" })] }),
      item({ id: "tinderbox", name: "Tinderbox", type: "equipment",
        activities: [activity({ type: "bonus" })] }),
      item({ id: "pistol", name: "Pistol" })
    ];

    const groups = buildActionGroups(items, CONFIG_DND5E);

    assert.deepEqual(groups.map(g => g.type), ["action", "bonus", "reaction"]);
    assert.deepEqual(groups.map(g => g.label), ["Actions", "Bonus Actions", "Reactions"]);
  });

  it("splits a multi-activity item across rows in the same group", () => {
    const cd = item({
      id: "cd", name: "Channel Divinity", type: "feat", uses: { value: 3, max: 3 },
      activities: [
        activity({ id: "a", name: "Turn Undead" }),
        activity({ id: "b", name: "Divine Spark: Heal" }),
        activity({ id: "c", name: "Divine Spark: Save" })
      ]
    });

    const [actions] = buildActionGroups([cd], CONFIG_DND5E);

    // Alphabetical within the group, and every row carries the same pool.
    assert.deepEqual(actions.entries.map(e => e.name),
      ["Divine Spark: Heal", "Divine Spark: Save", "Turn Undead"]);
    assert.deepEqual(actions.entries.map(e => e.uses.value), [3, 3, 3]);
    assert.deepEqual(actions.entries.map(e => e.activityId), ["b", "c", "a"]);
  });

  it("drops passive activations and keeps ones with no activation at all", () => {
    const items = [
      item({ id: "rest", name: "Second Wind", type: "feat",
        activities: [activity({ type: "shortRest" })] }),

      // Divine Strike: extra damage applied after something else has happened.
      // Not an action in the turn-economy sense, but very much a thing tapped.
      item({ id: "strike", name: "Divine Strike", type: "feat",
        activities: [activity({ type: "", labels: { activation: null } })] })
    ];

    const groups = buildActionGroups(items, CONFIG_DND5E);

    assert.deepEqual(groups.map(g => g.type), [OTHER_GROUP]);
    assert.equal(groups[0].other, true);
    assert.deepEqual(groups[0].entries.map(e => e.name), ["Divine Strike"]);
  });

  it("sorts an unrecognised activation type to the end rather than losing it", () => {
    const items = [
      item({ id: "odd", name: "Odd", type: "feat", activities: [activity({ type: "teleport" })] }),
      item({ id: "pistol", name: "Pistol" })
    ];

    const groups = buildActionGroups(items, CONFIG_DND5E);

    assert.deepEqual(groups.map(g => g.type), ["action", "teleport"]);

    // With no config entry there is no label to use, so the raw type stands in.
    assert.equal(groups[1].label, "teleport");
  });

  it("cross-lists a qualifying spell alongside features in the same group", () => {
    const items = [
      item({ id: "cd", name: "Channel Divinity", type: "feat",
        activities: [activity({ type: "bonus" })] }),
      item({ id: "smite", name: "Divine Smite", type: "spell", level: 1,
        activities: [activity({ id: "dmg", type: "bonus", activityType: "damage" })] })
    ];

    const [bonus] = buildActionGroups(items, CONFIG_DND5E);

    assert.equal(bonus.type, "bonus");
    assert.deepEqual(bonus.entries.map(e => e.name), ["Channel Divinity", "Divine Smite"]);

    const smite = bonus.entries.find(e => e.name === "Divine Smite");
    assert.equal(smite.action, "castSpell");
    assert.equal(smite.spellId, "smite");
    assert.equal(smite.itemType, "spell");
  });

  it("gives a cross-listed spell one row, not one per activity", () => {
    // Divine Smite really does carry four activities — two damage tiers each
    // paired with an internal "forward" one — and none of that plumbing
    // belongs on the actions screen as a row of its own.
    const smite = item({
      id: "smite", name: "Divine Smite", type: "spell", level: 1,
      activities: [
        activity({ id: "dmg1", type: "bonus", activityType: "damage" }),
        activity({ id: "fwd1", type: "bonus", activityType: "forward" }),
        activity({ id: "dmg2", type: "bonus", activityType: "damage" }),
        activity({ id: "fwd2", type: "bonus", activityType: "forward" })
      ]
    });

    const [bonus] = buildActionGroups([smite], CONFIG_DND5E);
    assert.equal(bonus.entries.length, 1);
  });

  it("does not cross-list a spell that does not qualify", () => {
    const light = item({ id: "light", name: "Light", type: "spell", level: 0,
      activities: [activity({ type: "action", activityType: "utility" })] });

    const groups = buildActionGroups([light], CONFIG_DND5E);
    assert.deepEqual(groups, []);
  });
});

/* -------------------------------------------- */

describe("buildActionsView", () => {
  it("reports empty when nothing can be used", () => {
    const view = buildActionsView({ items: [item({ equipped: false })] }, CONFIG_DND5E);
    assert.equal(view.empty, true);
    assert.deepEqual(view.groups, []);
  });

  it("survives an actor with no items", () => {
    assert.equal(buildActionsView({}, CONFIG_DND5E).empty, true);
  });
});

/* -------------------------------------------- */

describe("mergeEntries", () => {
  it("folds duplicate stacks into one row and sums their charges", () => {
    // Two flasks of holy water are two items with their own charge. Listing
    // both is accurate and useless: identical rows read as a bug, and on a
    // phone they cost space a fight needs.
    const [group] = buildActionGroups(stacks([1, 1]), CONFIG_DND5E, TYPE_LABELS);

    assert.equal(group.entries.length, 1);
    assert.deepEqual(group.entries[0].uses, { value: 2, max: 2 });
    assert.equal(group.entries[0].stacks, 2);
    assert.equal(group.entries[0].merged, true);
  });

  it("points the tap at a stack that still has a charge", () => {
    // The load-bearing part. Without it the tap keeps reaching the empty flask
    // while the full one sits behind it, and the second is unreachable.
    const [group] = buildActionGroups(stacks([0, 1]), CONFIG_DND5E, TYPE_LABELS);
    const [row] = group.entries;

    assert.equal(row.itemId, "water1");
    assert.equal(row.spent, false);
    assert.deepEqual(row.uses, { value: 1, max: 2 });
  });

  it("is spent only once every stack is", () => {
    const [group] = buildActionGroups(stacks([0, 0]), CONFIG_DND5E, TYPE_LABELS);
    assert.equal(group.entries[0].spent, true);

    // And the row still points somewhere real, so the tap reaches dnd5e and
    // lets it be the one to say there is nothing left.
    assert.equal(group.entries[0].itemId, "water0");
  });

  it("does not merge two different things one item can do", () => {
    const cd = item({
      id: "cd", name: "Channel Divinity", type: "feat", uses: { value: 3, max: 3 },
      activities: [
        activity({ id: "a", name: "Turn Undead" }),
        activity({ id: "b", name: "Divine Spark: Heal" })
      ]
    });

    const [group] = buildActionGroups([cd], CONFIG_DND5E, TYPE_LABELS);
    assert.equal(group.entries.length, 2);

    // And the shared pool is not double-counted by the merge pass.
    assert.deepEqual(group.entries.map(e => e.uses.value), [3, 3]);
  });

  it("keeps two items that only happen to share a name apart", () => {
    // Different sources, so different things — a homebrewed dagger and the
    // compendium one should not fold together.
    const entries = [
      { mergeKey: "a::Attack", name: "Dagger", itemId: "x", uses: null, spent: false, stacks: 1 },
      { mergeKey: "b::Attack", name: "Dagger", itemId: "y", uses: null, spent: false, stacks: 1 }
    ];

    assert.equal(mergeEntries(entries).length, 2);
  });
});

/* -------------------------------------------- */

describe("item kinds", () => {
  it("orders a group by kind before name", () => {
    // Purely alphabetical put a tool at the top of a fight's list and
    // scattered the weapons through the features. Kind first makes the list
    // read as blocks matching the stripe colours.
    const items = [
      item({ id: "tool", name: "Aaa Tools", type: "tool", equipped: false }),
      item({ id: "feat", name: "Zzz Feature", type: "feat" }),
      item({ id: "water", name: "Mmm Water", type: "consumable", equipped: false }),
      item({ id: "sword", name: "Zzz Sword", type: "weapon" }),
      item({ id: "mace", name: "Aaa Mace", type: "weapon" })
    ];

    const [group] = buildActionGroups(items, CONFIG_DND5E, TYPE_LABELS);

    assert.deepEqual(group.entries.map(e => e.name), [
      "Aaa Mace", "Zzz Sword",   // weapons first, alphabetical within the kind
      "Zzz Feature",
      "Mmm Water",
      "Aaa Tools"
    ]);
  });


  it("carries the type as both a key for the stripe and a word for the row", () => {
    const [group] = buildActionGroups([item()], CONFIG_DND5E, TYPE_LABELS);

    assert.equal(group.entries[0].itemType, "weapon");
    assert.equal(group.entries[0].typeLabel, "TYPES.Item.weapon");
  });

  it("leaves the label null for a type core has no name for", () => {
    // The stripe still gets its key, so an unnamed type loses its caption
    // rather than the whole row.
    const odd = item({ type: "tool", equipped: false });
    const [group] = buildActionGroups([odd], CONFIG_DND5E, TYPE_LABELS);

    assert.equal(group.entries[0].itemType, "tool");
    assert.equal(group.entries[0].typeLabel, null);
  });
});
