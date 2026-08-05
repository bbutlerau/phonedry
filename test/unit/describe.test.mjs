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

/** The cleric's pistol, as dnd5e labels it. A weapon has no components. */
const PISTOL = {
  activation: "Action",
  range: "30/90 ft",
  target: "",
  toHit: "+6",
  damages: [{ formula: "1d10 + 3", label: "1d10 + 3 Piercing", damageType: "piercing" }],
  properties: [{ abbr: "amm", label: "Ammunition" }]
};

/**
 * Chain mail, as dnd5e labels it.
 *
 * Everything a weapon has is empty and there is no description text at all in
 * the development world, which is the case that prompted these facts: without
 * them, holding it gives a name and a blank panel.
 */
const CHAIN_MAIL = {
  armor: "16 AC",
  damage: "",
  damages: [],
  properties: [{ abbr: "stealthDisadvantage", label: "Stealth Disadvantage" }]
};

describe("buildFacts", () => {
  it("puts the facts in the order they are asked for", () => {
    // What it costs to cast, how far it reaches, what it touches, how long it
    // lasts — the order a caster reads them at the table.
    assert.deepEqual(buildFacts(SPELL).map(f => f.value),
      ["Action", "120 ft", "1 creature", "1 round", "V, S"]);
  });

  it("leads a weapon with what it hits and what it does", () => {
    // The reason the row was held. Above range for the same reason casting time
    // is on a spell.
    const facts = buildFacts(PISTOL);

    assert.deepEqual(facts.map(f => f.label), [
      "PHONEDRY.Describe.CastingTime",
      "PHONEDRY.Describe.ToHit",
      "PHONEDRY.Describe.Damage",
      "PHONEDRY.Describe.Range",
      "PHONEDRY.Describe.Properties"
    ]);

    // The damage type comes with the formula here, unlike on an action row.
    // The actions screen shows the bare formula because the full label does not
    // fit a phone row; a panel has the width, and resistance is exactly what
    // someone opens one to check.
    assert.equal(facts[2].value, "1d10 + 3 Piercing");
  });

  it("joins a weapon that deals more than one kind of damage", () => {
    const facts = buildFacts({
      damages: [{ label: "1d8 + 3 Slashing" }, { label: "2d6 Fire" }]
    });

    assert.equal(facts[0].value, "1d8 + 3 Slashing, 2d6 Fire");
  });

  it("falls back to the bare formula where dnd5e composed no label", () => {
    assert.equal(buildFacts({ damages: [{ formula: "1d6" }] })[0].value, "1d6");
  });

  it("gives armour the one fact it has", () => {
    // Chain mail in the development world has an armour class, a property and
    // no description text whatsoever. Without these the panel is a name and a
    // blank.
    const facts = buildFacts(CHAIN_MAIL);

    assert.deepEqual(facts, [
      { label: "PHONEDRY.Describe.ArmourClass", value: "16 AC" },
      { label: "PHONEDRY.Describe.Properties", value: "Stealth Disadvantage" }
    ]);
  });

  it("does not state a spell's properties twice", () => {
    // dnd5e reports concentration and ritual through `components.tags` and
    // again in `properties`. Only the first is used, or every spell would say
    // the same thing in two rows.
    const facts = buildFacts({
      ...SPELL,
      components: { vsm: "V, S", tags: ["Concentration"] },
      properties: [{ label: "Concentration" }, { label: "Verbal" }]
    });

    assert.equal(facts.filter(f => f.label === "PHONEDRY.Describe.Properties").length, 0);
    assert.equal(facts.at(-1).value, "Concentration");
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
