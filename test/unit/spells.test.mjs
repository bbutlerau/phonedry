/**
 * Tests for the spells mapper.
 *
 * Run with `npm run test:unit`. Plain objects shaped like dnd5e's spell items,
 * taken from real ones read out of the development world.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  buildSlots, buildSpellGroups, buildSpellsView, canPrepare, describeSpell, isPrepared, PREPARED
} from "../../scripts/data/spells.mjs";

const CONFIG_DND5E = {
  spellLevels: { 0: "Cantrip", 1: "1st Level", 2: "2nd Level" },
  spellPreparationModes: { pact: { label: "Pact Magic" } }
};

/**
 * A spell item, shaped like dnd5e's.
 *
 * @param {object} [overrides]
 * @returns {object}
 */
function spell({ level = 1, method = "spell", prepared = 0, canPrepare, ...rest } = {}) {
  return {
    id: rest.id ?? "spell-1",
    type: "spell",
    name: rest.name ?? "Bless",
    img: "icons/svg/item-bag.svg",
    labels: { school: "Enchantment", activation: "Action", range: "30 ft" },
    system: {
      level,
      method,

      // A number in dnd5e 5.x — 0 unprepared, 1 prepared, 2 always prepared —
      // not the `{ mode, prepared }` object of earlier majors.
      prepared,

      // dnd5e's own judgement, which the mapper prefers over anything it could
      // derive. Left undefined here unless a test is about it, so the fallback
      // path stays covered too.
      ...(canPrepare === undefined ? {} : { canPrepare }),

      properties: new Set(rest.properties ?? []),
      uses: rest.uses ?? {}
    },
    ...rest
  };
}

/* -------------------------------------------- */

describe("canPrepare / isPrepared", () => {
  it("treats a cantrip as always available and never preparable", () => {
    const cantrip = spell({ level: 0 });
    assert.equal(canPrepare(cantrip), false);
    assert.equal(isPrepared(cantrip), true);
  });

  it("offers the toggle for an ordinary slot-cast spell", () => {
    assert.equal(canPrepare(spell()), true);
    assert.equal(isPrepared(spell({ prepared: 0 })), false);
    assert.equal(isPrepared(spell({ prepared: 1 })), true);
  });

  it("does not offer the toggle for an always-prepared spell", () => {
    // A domain spell or a racial grant, which dnd5e marks with prepared === 2.
    // It is prepared by something the player cannot change from this sheet, so
    // a control beside it would be a lie.
    const domain = spell({ prepared: PREPARED.ALWAYS });
    assert.equal(canPrepare(domain), false);
    assert.equal(isPrepared(domain), true);
  });

  it("honours dnd5e when it says a spell cannot be prepared", () => {
    // A class that knows spells rather than preparing them. Only the system
    // knows that, so its no is respected.
    const known = spell({ canPrepare: false });
    assert.equal(canPrepare(known), false);
    assert.equal(isPrepared(known), true);
  });

  it("ignores dnd5e when it says a cantrip can be prepared", () => {
    // It says exactly that: canPrepare is true for every spell on a cleric,
    // cantrips included. Trusting it put a preparation checkbox beside
    // Guidance. The flag means "this item has a preparation field", not "this
    // character prepares this spell".
    const cantrip = spell({ level: 0, canPrepare: true });
    assert.equal(canPrepare(cantrip), false);
    assert.equal(isPrepared(cantrip), true);
  });

  it("still excludes an always-prepared spell even when dnd5e says it can be prepared", () => {
    const domain = spell({ prepared: PREPARED.ALWAYS, canPrepare: true });
    assert.equal(canPrepare(domain), false);
    assert.equal(isPrepared(domain), true);
  });

  it("does not offer the toggle for at-will or innate casting", () => {
    // These are cast by different rules, not by being prepared.
    for ( const method of ["atwill", "innate"] ) {
      const item = spell({ method });
      assert.equal(canPrepare(item), false, method);
      assert.equal(isPrepared(item), true, method);
    }
  });
});

/* -------------------------------------------- */

describe("describeSpell", () => {
  it("reads dnd5e's own labels rather than deriving them", () => {
    // These strings account for spell scaling and localisation, and are the
    // system's job to compute.
    const view = describeSpell(spell());
    assert.equal(view.school, "Enchantment");
    assert.equal(view.activation, "Action");
    assert.equal(view.range, "30 ft");
  });

  it("flags concentration and ritual", () => {
    const view = describeSpell(spell({ properties: ["concentration", "ritual"] }));
    assert.equal(view.concentration, true);
    assert.equal(view.ritual, true);
  });

  it("shows limited uses only when there are any", () => {
    assert.equal(describeSpell(spell()).uses, null);

    const limited = describeSpell(spell({ uses: { value: 2, max: 3, label: "3/Day" } }));
    assert.deepEqual(limited.uses, { value: 2, max: 3, label: "3/Day" });
  });

  it("survives a spell with no labels computed yet", () => {
    const bare = { id: "x", name: "Bare", system: { level: 1, properties: new Set() } };
    const view = describeSpell(bare);
    assert.equal(view.school, null);
    assert.equal(view.level, 1);
  });
});

/* -------------------------------------------- */

describe("buildSlots", () => {
  const system = {
    spells: {
      spell1: { value: 4, max: 4, level: 1 },
      spell2: { value: 0, max: 3, level: 2 },
      spell5: { value: 0, max: 0, level: 5 },
      pact: { value: 0 }
    }
  };

  it("drops levels the character has no slots for", () => {
    // A level 7 cleric has nothing above fourth. Nine rows of 0/0 would push
    // the spells themselves off a phone screen.
    assert.deepEqual(buildSlots(system, CONFIG_DND5E).map(s => s.key), ["spell1", "spell2"]);
  });

  it("keeps a level whose slots are all spent", () => {
    // Empty is information; a missing row would shift everything else.
    const second = buildSlots(system, CONFIG_DND5E).find(s => s.key === "spell2");
    assert.equal(second.value, 0);
    assert.equal(second.max, 3);
  });

  it("includes pact magic when the character has it", () => {
    const warlock = { spells: { pact: { value: 2, max: 2, level: 3 } } };
    const [slot] = buildSlots(warlock, CONFIG_DND5E);
    assert.equal(slot.pact, true);
    assert.equal(slot.label, "Pact Magic");
  });
});

/* -------------------------------------------- */

describe("buildSpellGroups", () => {
  const system = { spells: { spell1: { value: 4, max: 4, level: 1 } } };
  const spells = [
    spell({ id: "c1", name: "Light", level: 0 }),
    spell({ id: "s2", name: "Bless", level: 1, prepared: PREPARED.YES }),
    spell({ id: "s1", name: "Aid", level: 1, prepared: 0 })
  ];

  const groups = buildSpellGroups(spells, system, CONFIG_DND5E);

  it("orders groups by level, not alphabetically", () => {
    // The opposite of the skills list, and deliberately so: a spell is chosen
    // by what it costs before what it does.
    assert.deepEqual(groups.map(g => g.level), [0, 1]);
  });

  it("sorts spells alphabetically within a level", () => {
    assert.deepEqual(groups[1].spells.map(s => s.name), ["Aid", "Bless"]);
  });

  it("attaches the slot counter to a level, but never to cantrips", () => {
    // Cantrips cost nothing, so a counter beside them would be noise.
    assert.equal(groups[0].slots, null);
    assert.equal(groups[1].slots.value, 4);
  });

  it("counts how many of a level are prepared", () => {
    assert.equal(groups[1].prepared, 1);
    assert.equal(groups[1].preparable, true);
    assert.equal(groups[0].preparable, false);
  });
});

/* -------------------------------------------- */

describe("buildSpellsView", () => {
  it("reports emptiness rather than rendering an empty list", () => {
    const view = buildSpellsView({ system: {}, items: [] }, CONFIG_DND5E);
    assert.equal(view.empty, true);
    assert.deepEqual(view.groups, []);
  });

  it("ignores items that are not spells", () => {
    // An actor's items are everything they carry. A mace has no business in a
    // spell list, and a filter that let it through would put it under a level
    // heading with a prepare toggle beside it.
    const view = buildSpellsView({
      system: { spells: {} },
      items: [
        spell({ id: "s", name: "Bless" }),
        { id: "w", type: "weapon", name: "Mace", system: { level: 1 } }
      ]
    }, CONFIG_DND5E);

    assert.equal(view.empty, false);
    assert.deepEqual(view.groups.flatMap(g => g.spells.map(sp => sp.name)), ["Bless"]);
  });
});
