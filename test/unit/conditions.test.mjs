/**
 * Tests for the conditions mapper.
 *
 * Run with `npm run test:unit`. Plain objects shaped like dnd5e's config and
 * Foundry's active effects.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  buildConditions, buildConditionsView, describeEffect, levelsFor
} from "../../scripts/data/conditions.mjs";

/**
 * A stand-in for CONFIG.DND5E, carrying only what the mapper reads.
 *
 * `pseudo` marks entries dnd5e uses internally rather than conditions in the
 * rules; `levels` marks exhaustion, which is a scale rather than a switch.
 */
const CONFIG_DND5E = {
  conditionTypes: {
    prone: { name: "Prone", img: "prone.svg", reference: "Compendium.dnd5e.rules.prone" },
    blinded: { name: "Blinded", img: "blinded.svg", reference: "Compendium.dnd5e.rules.blinded" },
    exhaustion: { name: "Exhaustion", img: "exhaustion.svg", levels: 6 },

    // Not a condition in the rules — a marker the system applies itself.
    bleeding: { name: "Bleeding", img: "bleeding.svg", pseudo: true }
  }
};

/**
 * An active effect, shaped like Foundry's.
 *
 * @param {object} [overrides]
 * @returns {object}
 */
function effect({
  name = "Bless", uuid = "Actor.a.ActiveEffect.e1", disabled = false,
  isTemporary = true, isSuppressed = false, statuses = [], parent, duration = "1 minute"
} = {}) {
  return {
    name, uuid, disabled, isTemporary, isSuppressed,
    statuses: new Set(statuses),
    img: "bless.svg",
    duration: { label: duration },
    ...(parent === undefined ? {} : { parent })
  };
}

/* -------------------------------------------- */

describe("levelsFor", () => {
  it("reads the level count from config rather than assuming exhaustion's", () => {
    // dnd5e changed exhaustion twice between 2014 and 2024, so the number of
    // levels is exactly the kind of thing that moves again.
    assert.equal(levelsFor({ levels: 6 }), 6);
    assert.equal(levelsFor({}), null);
    assert.equal(levelsFor(undefined), null);
  });
});

/* -------------------------------------------- */

describe("buildConditions", () => {
  it("drops pseudo-conditions, which are not conditions in the rules", () => {
    const names = buildConditions(CONFIG_DND5E, new Set(), {}).map(c => c.id);
    assert.deepEqual(names, ["blinded", "exhaustion", "prone"]);
  });

  it("reads active state from the actor's statuses", () => {
    // Core keeps this set in step with the effects on the actor, so a condition
    // whose effect has been disabled correctly reads as off.
    const conditions = buildConditions(CONFIG_DND5E, new Set(["prone"]), {});

    assert.equal(conditions.find(c => c.id === "prone").active, true);
    assert.equal(conditions.find(c => c.id === "blinded").active, false);
  });

  it("carries the rule reference so a condition can be held to read it", () => {
    const prone = buildConditions(CONFIG_DND5E, new Set(), {}).find(c => c.id === "prone");
    assert.equal(prone.reference, "Compendium.dnd5e.rules.prone");

    // Absent where dnd5e has none, in which case the row offers no hold rather
    // than one that opens nothing.
    const exhaustion = buildConditions(CONFIG_DND5E, new Set(), {}).find(c => c.id === "exhaustion");
    assert.equal(exhaustion.reference, null);
  });

  it("treats exhaustion as a level rather than a switch", () => {
    const system = { attributes: { exhaustion: 3 } };
    const exhaustion = buildConditions(CONFIG_DND5E, new Set(["exhaustion"]), system)
      .find(c => c.id === "exhaustion");

    assert.equal(exhaustion.levels, 6);
    assert.equal(exhaustion.level, 3);

    // And an ordinary condition carries neither, so the template can branch.
    const prone = buildConditions(CONFIG_DND5E, new Set(), system).find(c => c.id === "prone");
    assert.equal(prone.levels, null);
    assert.equal(prone.level, null);
  });
});

/* -------------------------------------------- */

describe("describeEffect", () => {
  it("names the item an effect came from, not the effect's own parent type", () => {
    // "Rage" tells a player less than "Rage — Barbarian feature" when they are
    // working out why their sheet changed.
    const rage = describeEffect(effect({
      name: "Rage", parent: { documentName: "Item", name: "Rage", type: "feat" }
    }));

    assert.equal(rage.source, "Rage");
    assert.equal(rage.sourceType, "feat");
  });

  it("reports no source for an effect living on the actor itself", () => {
    // A spell someone else cast lands directly on the actor, so there is no
    // owned item to name.
    const bless = describeEffect(effect({ parent: { documentName: "Actor", name: "Someone" } }));
    assert.equal(bless.source, null);
    assert.equal(bless.sourceType, null);

    assert.equal(describeEffect(effect()).source, null);
  });

  it("carries duration and disabled state", () => {
    const off = describeEffect(effect({ disabled: true, duration: "3 rounds" }));
    assert.equal(off.disabled, true);
    assert.equal(off.duration, "3 rounds");

    // Foundry leaves the label empty rather than null when there is no
    // duration, which would render as a stray separator.
    assert.equal(describeEffect(effect({ duration: "" })).duration, null);
  });
});

/* -------------------------------------------- */

describe("buildConditionsView", () => {
  const actor = { statuses: new Set(["prone"]), system: { attributes: { exhaustion: 0 } } };

  it("keeps conditions and applied effects apart", () => {
    const view = buildConditionsView(actor, [effect({ name: "Bless" })], CONFIG_DND5E);

    assert.equal(view.conditions.length, 3);
    assert.deepEqual(view.applied.map(e => e.name), ["Bless"]);
    assert.equal(view.noneApplied, false);
  });

  it("does not list a condition twice under a different name", () => {
    // The effect behind a toggled condition is already represented by the
    // toggle; listing it again as something "affecting you" would read as two
    // separate things being wrong.
    const proneEffect = effect({ name: "Prone", statuses: ["prone"] });
    const view = buildConditionsView(actor, [proneEffect], CONFIG_DND5E);

    assert.deepEqual(view.applied, []);
    assert.equal(view.noneApplied, true);
  });

  it("omits passive effects, which are traits rather than things happening", () => {
    // Darkvision from a species is not something affecting you right now, and
    // listing every one would bury the Bless among entries nobody reads.
    const view = buildConditionsView(actor, [
      effect({ name: "Bless" }),
      effect({ name: "Gnomish Cunning", isTemporary: false })
    ], CONFIG_DND5E);

    assert.deepEqual(view.applied.map(e => e.name), ["Bless"]);
  });

  it("counts what is currently on the character, ignoring what is switched off", () => {
    const view = buildConditionsView(actor, [
      effect({ name: "Bless" }),
      effect({ name: "Bane", disabled: true })
    ], CONFIG_DND5E);

    // One condition (prone) plus one live effect; the disabled one does not
    // count, because the question is what is affecting you now.
    assert.equal(view.activeCount, 2);
  });

  it("survives an actor with no statuses and no effects", () => {
    const view = buildConditionsView({}, [], CONFIG_DND5E);
    assert.equal(view.activeCount, 0);
    assert.equal(view.noneApplied, true);
  });
});
