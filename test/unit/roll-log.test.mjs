/**
 * Tests for the roll log mapper.
 *
 * Run with `npm run test:unit`. No Foundry, no browser: the fixtures below are
 * plain objects shaped like the chat messages and rolls Foundry produces, taken
 * from real ones read out of the development world.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  describeRoll, isOwnRoll, pushRoll, ROLL_LOG_LIMIT, MAX_SHOWN_DICE
} from "../../scripts/data/roll-log.mjs";
import { toChatCommand } from "../../scripts/rolls.mjs";

const USER = "user-1";
const ACTOR = "actor-1";

/**
 * A rolled chat message, shaped like Foundry's.
 *
 * @param {object} [overrides]
 * @returns {object}
 */
function message({ dice = [{ faces: 20, results: [{ result: 15, active: true }] }], ...rest } = {}) {
  return {
    id: "msg-1",
    flavor: "Strength (Athletics) Check",
    author: { id: USER },
    speaker: { actor: ACTOR },
    rolls: [{
      total: 14,
      formula: "1d20 - 1",
      isCritical: false,
      isFumble: false,
      dice
    }],
    ...rest
  };
}

/* -------------------------------------------- */

describe("isOwnRoll", () => {
  const viewer = { userId: USER, actorId: ACTOR };

  it("accepts a roll this user made", () => {
    assert.equal(isOwnRoll(message(), viewer), true);
  });

  it("accepts a roll someone else made for this character", () => {
    // A GM rolling a save on a player's behalf. They did not author it, and it
    // is exactly the roll they most want to see.
    const gmRoll = message({ author: { id: "gm" } });
    assert.equal(isOwnRoll(gmRoll, viewer), true);
  });

  it("ignores another character's roll", () => {
    const other = message({ author: { id: "gm" }, speaker: { actor: "actor-2" } });
    assert.equal(isOwnRoll(other, viewer), false);
  });

  it("ignores messages that carry no roll", () => {
    // Ordinary chat. The log is a display of the sheet's output, not a chat
    // client, and this is the line between the two.
    assert.equal(isOwnRoll(message({ rolls: [] }), viewer), false);
    assert.equal(isOwnRoll({ flavor: "hello" }, viewer), false);
  });

  it("does not match on a null actor", () => {
    // A player with no character assigned must not inherit every roll whose
    // speaker happens to be unset.
    const orphan = message({ author: { id: "gm" }, speaker: { actor: null } });
    assert.equal(isOwnRoll(orphan, { userId: USER, actorId: null }), false);
  });
});

/* -------------------------------------------- */

describe("describeRoll", () => {
  it("reads the total, formula and flavour", () => {
    const view = describeRoll(message());
    assert.equal(view.total, 14);
    assert.equal(view.formula, "1d20 - 1");
    assert.equal(view.flavor, "Strength (Athletics) Check");
  });

  it("falls back to the formula when there is no flavour", () => {
    assert.equal(describeRoll(message({ flavor: "" })).flavor, "1d20 - 1");
  });

  it("returns null for a message with no roll", () => {
    assert.equal(describeRoll(message({ rolls: [] })), null);
    assert.equal(describeRoll(undefined), null);
  });

  it("marks the die advantage discarded", () => {
    // Both spellings, because Foundry sets `active: false` and `discarded:
    // true` and either alone has been seen in the wild.
    const view = describeRoll(message({
      dice: [{
        faces: 20,
        results: [{ result: 11, active: false, discarded: true }, { result: 12, active: true }]
      }]
    }));

    assert.deepEqual(view.dice.map(d => d.dropped), [true, false]);
    assert.deepEqual(view.dice.map(d => d.value), [11, 12]);
  });

  it("flags a natural 20 and a natural 1, but only on a d20", () => {
    const nat20 = describeRoll(message({
      dice: [{ faces: 20, results: [{ result: 20, active: true }] }]
    }));
    assert.equal(nat20.dice[0].natural20, true);

    const nat1 = describeRoll(message({
      dice: [{ faces: 20, results: [{ result: 1, active: true }] }]
    }));
    assert.equal(nat1.dice[0].natural1, true);

    // A 1 on a d6 is a bad damage roll, not an event.
    const d6 = describeRoll(message({
      dice: [{ faces: 6, results: [{ result: 1, active: true }] }]
    }));
    assert.equal(d6.dice[0].natural1, false);
  });

  it("takes dnd5e's word for a critical rather than comparing against 20", () => {
    // An improved critical range crits on 19, and only the system knows that.
    const view = describeRoll(message({
      rolls: [{
        total: 27, formula: "1d20 + 8", isCritical: true, isFumble: false,
        dice: [{ faces: 20, results: [{ result: 19, active: true }] }]
      }]
    }));
    assert.equal(view.critical, true);
    assert.equal(view.dice[0].natural20, false);
  });

  it("summarises a large handful of dice rather than listing them all", () => {
    // A fireball's worth. The individual faces are noise next to the total, and
    // eight of them would not fit the bar.
    const results = Array.from({ length: 8 }, () => ({ result: 4, active: true }));
    const view = describeRoll(message({ dice: [{ faces: 6, results }] }));

    assert.equal(view.dice.length, MAX_SHOWN_DICE);
    assert.equal(view.moreDice, 8 - MAX_SHOWN_DICE);
  });

  it("collects dice across several terms", () => {
    const view = describeRoll(message({
      dice: [
        { faces: 20, results: [{ result: 15, active: true }] },
        { faces: 6, results: [{ result: 3, active: true }] }
      ]
    }));
    assert.deepEqual(view.dice.map(d => d.value), [15, 3]);
  });

  it("survives a roll with no dice at all", () => {
    // dnd5e's fixed initiative score setting produces one of these.
    const view = describeRoll(message({
      rolls: [{ total: 13, formula: "13", dice: [] }]
    }));
    assert.deepEqual(view.dice, []);
    assert.equal(view.total, 13);
  });
});

/* -------------------------------------------- */

describe("pushRoll", () => {
  it("puts the newest roll first, where the eye lands", () => {
    const log = pushRoll(pushRoll([], { id: "a" }), { id: "b" });
    assert.deepEqual(log.map(e => e.id), ["b", "a"]);
  });

  it("keeps the log to its limit", () => {
    let log = [];
    for ( let i = 0; i < ROLL_LOG_LIMIT + 5; i++ ) log = pushRoll(log, { id: `r${i}` });

    assert.equal(log.length, ROLL_LOG_LIMIT);
    assert.equal(log[0].id, `r${ROLL_LOG_LIMIT + 4}`);
  });

  it("returns a new array rather than mutating", () => {
    // The log is render state; mutating in place makes it impossible to tell
    // whether a re-render is needed.
    const original = [];
    const next = pushRoll(original, { id: "a" });
    assert.equal(original.length, 0);
    assert.notEqual(original, next);
  });

  it("ignores a null entry", () => {
    const log = [{ id: "a" }];
    assert.equal(pushRoll(log, null), log);
  });
});

/* -------------------------------------------- */

describe("toChatCommand", () => {
  it("turns a bare formula into a roll command", () => {
    // Without the prefix Foundry treats it as ordinary chat and posts the text
    // rather than rolling it.
    assert.equal(toChatCommand("2d6 + 3"), "/r 2d6 + 3");
  });

  it("passes a command through untouched", () => {
    // This is what makes /gmroll, /blindroll and /selfroll work without this
    // module knowing they exist.
    assert.equal(toChatCommand("/gmroll 1d20"), "/gmroll 1d20");
    assert.equal(toChatCommand("/r 1d20"), "/r 1d20");
  });

  it("trims what was typed", () => {
    // A phone keyboard adds a trailing space after autocorrect readily enough.
    assert.equal(toChatCommand("  1d20  "), "/r 1d20");
  });

  it("returns null for nothing to roll", () => {
    assert.equal(toChatCommand(""), null);
    assert.equal(toChatCommand("   "), null);
    assert.equal(toChatCommand(null), null);
    assert.equal(toChatCommand(undefined), null);
  });
});
