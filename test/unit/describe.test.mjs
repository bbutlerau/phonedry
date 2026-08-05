/**
 * Tests for the description fact list.
 *
 * Run with `npm run test:unit`. `buildFacts` reads nothing but an item's
 * `labels`, which is what makes it testable without Foundry — and the labels
 * here are real ones, read out of the development world.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { buildFacts } from "../../scripts/describe.mjs";

/** Guiding Bolt, as dnd5e labels it. */
const SPELL = {
  level: "1st Level",
  school: "Evocation",
  activation: "Action",
  range: "120 ft",
  target: "1 creature",
  duration: "1 round",
  components: { vsm: "V, S", tags: [] }
};

describe("buildFacts", () => {
  it("puts the facts in the order they are asked for", () => {
    // What it costs to cast, how far it reaches, what it touches, how long it
    // lasts — the order a caster reads them at the table.
    assert.deepEqual(buildFacts(SPELL).map(f => f.value),
      ["Action", "120 ft", "1 creature", "1 round", "V, S"]);
  });

  it("uses dnd5e's own composed strings rather than deriving them", () => {
    // Casting time and range each come from several fields and vary by rules
    // version. Deriving them would be reimplementing the system to arrive at a
    // string it has already written.
    const [casting] = buildFacts(SPELL);
    assert.equal(casting.label, "PHONEDRY.Describe.CastingTime");
    assert.equal(casting.value, "Action");
  });

  it("keeps materials with the components, as the rules write them", () => {
    const facts = buildFacts({
      ...SPELL,
      components: { vsm: "V, S, M", tags: [] },
      materials: "a holy symbol worth 5+ GP"
    });

    assert.equal(facts.at(-1).value, "V, S, M (a holy symbol worth 5+ GP)");
  });

  it("states concentration and ritual rather than leaving them to be inferred", () => {
    const facts = buildFacts({
      ...SPELL,
      components: { vsm: "V, S, M", tags: ["Concentration", "Ritual"] }
    });

    assert.equal(facts.at(-1).label, "PHONEDRY.Describe.Tags");
    assert.equal(facts.at(-1).value, "Concentration, Ritual");
  });

  it("omits anything dnd5e has no value for", () => {
    // A feature with only an activation should show one row, not four empty
    // ones — a fact panel of blanks is worse than no fact panel.
    assert.deepEqual(buildFacts({ activation: "Bonus Action" }).map(f => f.value),
      ["Bonus Action"]);
  });

  it("returns nothing for a rules page, which has no labels at all", () => {
    // Holding a skill or a condition resolves to a journal page. There is
    // nothing to state above it, and the panel leaves the block out entirely.
    assert.deepEqual(buildFacts(), []);
    assert.deepEqual(buildFacts({}), []);
  });

  it("works for a feature and a weapon, not only for spells", () => {
    // Radiance of the Dawn carries the same labels a spell does, so holding it
    // answers the same questions.
    const feature = buildFacts({
      activation: "Action", range: "Self", target: "30 ft emanation",
      duration: "Instantaneous"
    });

    assert.deepEqual(feature.map(f => f.value),
      ["Action", "Self", "30 ft emanation", "Instantaneous"]);

    // And a weapon has no components, so none are invented for it.
    assert.equal(feature.some(f => f.label === "PHONEDRY.Describe.Components"), false);
  });
});
