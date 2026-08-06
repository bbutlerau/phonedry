/**
 * Tests for the targeting mapper.
 *
 * Run with `npm run test:unit`. The target data here is real, read out of the
 * development world: Bless affects three creatures with no template, Burning
 * Hands is a cone with no creature target at all.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  buildTargetsView, groupCandidates, needsTargets, targetLimit
} from "../../scripts/data/targets.mjs";

/** An activity's target block, shaped like dnd5e's. */
function target({ templateType = "", affectsType = "creature", count = null, type } = {}) {
  return {
    ...(type === undefined ? {} : { type }),
    target: { template: { type: templateType }, affects: { type: affectsType, count } }
  };
}

/** A candidate row, as the Foundry-facing layer builds them. */
function candidate({ id = "Actor.a", name = "Someone", disposition = 1, defeated = false } = {}) {
  return { id, name, img: "portrait.webp", ac: 15, disposition, defeated, tokenId: "t1" };
}

/* -------------------------------------------- */

describe("needsTargets", () => {
  it("wants targets for a spell aimed at creatures", () => {
    assert.equal(needsTargets(target({ affectsType: "creature", count: 3 })), true);
    assert.equal(needsTargets(target({ affectsType: "ally" })), true);
    assert.equal(needsTargets(target({ affectsType: "enemy" })), true);
  });

  it("refuses a template spell even though it also names creatures", () => {
    // A fireball is aimed at a patch of ground. Who is caught in it needs the
    // map this client does not draw, and offering a name list would invite a
    // player to pick three and believe the area had been resolved.
    assert.equal(needsTargets(target({ templateType: "cone", affectsType: "creature" })), false);
    assert.equal(needsTargets(target({ templateType: "sphere", affectsType: "" })), false);
  });

  it("refuses anything with no creature to pick", () => {
    // `self` has exactly one answer; `space` and `object` are things on a map.
    assert.equal(needsTargets(target({ affectsType: "self" })), false);
    assert.equal(needsTargets(target({ affectsType: "space" })), false);
    assert.equal(needsTargets(target({ affectsType: "" })), false);
    assert.equal(needsTargets(undefined), false);
  });

  it("wants targets for an attack roll even with no affects type stated", () => {
    // A weapon's own Attack activity, read out of the development world:
    // dnd5e leaves `target.affects.type` empty on it, unlike a spell — making
    // an attack roll already implies a target, so the rules never need it
    // spelled out the way a spell's creature-or-ally-or-enemy choice does.
    assert.equal(needsTargets(target({ type: "attack", affectsType: "" })), true);
  });

  it("still refuses an attack roll with a template", () => {
    // Not a real dnd5e shape today, but the exclusion should hold regardless
    // of what kind of activity is asking for it.
    assert.equal(needsTargets(target({ type: "attack", templateType: "cone" })), false);
  });
});

/* -------------------------------------------- */

describe("targetLimit", () => {
  it("reports how many the spell allows", () => {
    assert.equal(targetLimit(target({ count: 3 })), 3);
  });

  it("reports no limit rather than zero where dnd5e states none", () => {
    // Zero would read as "you may target nobody", which is not what an absent
    // count means.
    assert.equal(targetLimit(target({ count: null })), null);
    assert.equal(targetLimit(target({ count: 0 })), null);
    assert.equal(targetLimit(undefined), null);
  });
});

/* -------------------------------------------- */

describe("groupCandidates", () => {
  it("puts enemies first, where the thumb already is", () => {
    // In a fight the common case is aiming at the thing trying to kill you,
    // and the list is read under time pressure.
    const groups = groupCandidates([
      candidate({ id: "a", name: "Ally", disposition: 1 }),
      candidate({ id: "b", name: "Dragon", disposition: -1 })
    ]);

    assert.deepEqual(groups.map(g => g.id), ["enemies", "allies"]);
  });

  it("sorts defeated combatants to the bottom without dropping them", () => {
    // Plenty of things are still legally aimed at a downed creature, and
    // removing the row would shift every other one under a moving finger.
    const [enemies] = groupCandidates([
      candidate({ id: "a", name: "Aaa", disposition: -1, defeated: true }),
      candidate({ id: "b", name: "Zzz", disposition: -1 })
    ]);

    assert.deepEqual(enemies.entries.map(e => e.name), ["Zzz", "Aaa"]);
  });

  it("treats an unknown disposition as neither side", () => {
    // A combatant with no token has no disposition to read, and guessing at a
    // side would be worse than saying nothing.
    const groups = groupCandidates([candidate({ disposition: 0 })]);
    assert.deepEqual(groups.map(g => g.id), ["other"]);
  });

  it("drops empty groups rather than showing empty headings", () => {
    const groups = groupCandidates([candidate({ disposition: -1 })]);
    assert.deepEqual(groups.map(g => g.id), ["enemies"]);
  });
});

/* -------------------------------------------- */

describe("buildTargetsView", () => {
  const candidates = [
    candidate({ id: "a", name: "Ally", disposition: 1 }),
    candidate({ id: "b", name: "Dragon", disposition: -1 })
  ];

  it("marks which candidates are chosen", () => {
    const view = buildTargetsView({
      activity: target({ count: 3 }), name: "Bless",
      candidates, selected: new Set(["a"])
    });

    const [enemies, allies] = view.groups;
    assert.equal(allies.entries[0].selected, true);
    assert.equal(enemies.entries[0].selected, false);
    assert.equal(view.count, 1);
    assert.equal(view.none, false);
  });

  it("warns past the limit rather than refusing the pick", () => {
    // How many creatures a spell may affect is a rule, and dnd5e owns rules.
    // But a player who has picked one too many should hear about it before
    // casting, not after.
    const view = buildTargetsView({
      activity: target({ count: 1 }), candidates, selected: new Set(["a", "b"])
    });

    assert.equal(view.over, true);
    assert.equal(view.limit, 1);
  });

  it("does not warn when the spell states no limit", () => {
    const view = buildTargetsView({
      activity: target({ count: null }), candidates, selected: new Set(["a", "b"])
    });

    assert.equal(view.over, false);
  });

  it("reports having nobody to offer", () => {
    const view = buildTargetsView({ activity: target(), candidates: [] });
    assert.equal(view.empty, true);
    assert.equal(view.none, true);
  });
});
