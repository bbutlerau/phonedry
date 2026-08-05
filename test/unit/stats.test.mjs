/**
 * Tests for the actor → view model mapper.
 *
 * Run with `npm run test:unit`. These need no Foundry, no browser and no world:
 * the mapper is pure, which is the entire reason it was separated out. They are
 * also the only tests in this repo that can run in CI.
 *
 * What is worth testing here is the mapping decisions — sign formatting, the
 * proficiency multiplier, when death saves appear, what happens when a field is
 * missing — rather than that Handlebars can print a number.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  buildAbilities, buildDeathSaves, buildHeader, buildSenses, buildSkills,
  buildStatsView, formatModifier, proficiencyLevel
} from "../../scripts/data/stats.mjs";

import { CLERIC, CONFIG_DND5E, clericWith } from "./fixtures/character.mjs";

/* -------------------------------------------- */

describe("formatModifier", () => {
  it("signs positive values, which a bare number would not", () => {
    assert.equal(formatModifier(3), "+3");
  });

  it("keeps the sign on negatives without doubling it", () => {
    assert.equal(formatModifier(-1), "-1");
  });

  it("renders zero as +0, so a column of modifiers stays aligned", () => {
    assert.equal(formatModifier(0), "+0");
  });

  it("treats a missing value as zero rather than printing NaN", () => {
    assert.equal(formatModifier(undefined), "+0");
    assert.equal(formatModifier(null), "+0");
  });
});

/* -------------------------------------------- */

describe("proficiencyLevel", () => {
  it("maps dnd5e's four multipliers onto four names", () => {
    assert.equal(proficiencyLevel(0), "none");
    assert.equal(proficiencyLevel(0.5), "half");
    assert.equal(proficiencyLevel(1), "proficient");
    assert.equal(proficiencyLevel(2), "expertise");
  });

  it("treats anything above expertise as expertise", () => {
    // Modules that stack proficiency can push this past 2, and the sheet has
    // no fifth pip to show for it.
    assert.equal(proficiencyLevel(3), "expertise");
  });
});

/* -------------------------------------------- */

describe("buildAbilities", () => {
  const abilities = buildAbilities(CLERIC.system, CONFIG_DND5E);

  it("returns one row per configured ability, in config order", () => {
    assert.deepEqual(abilities.map(a => a.key), ["str", "dex", "wis"]);
  });

  it("formats the check modifier and the save separately", () => {
    const str = abilities.find(a => a.key === "str");
    assert.equal(str.mod, "-1");
    assert.equal(str.save, "-1");

    // Wisdom is save-proficient, so the two diverge — which is exactly why the
    // sheet offers them as two different taps.
    const wis = abilities.find(a => a.key === "wis");
    assert.equal(wis.mod, "+4");
    assert.equal(wis.save, "+7");
  });

  it("reports save proficiency as a name the template can use as a class", () => {
    assert.equal(abilities.find(a => a.key === "wis").saveProficiency, "proficient");
    assert.equal(abilities.find(a => a.key === "str").saveProficiency, "none");
  });

  it("survives an ability the actor has no data for", () => {
    // Reached when a module registers a new ability that existing characters
    // predate. Showing a default beats throwing inside a render.
    const rows = buildAbilities({}, CONFIG_DND5E);
    assert.equal(rows.length, 3);
    assert.equal(rows[0].score, 10);
    assert.equal(rows[0].mod, "+0");
  });
});

/* -------------------------------------------- */

describe("buildSkills", () => {
  const skills = buildSkills(CLERIC.system, CONFIG_DND5E);

  it("sorts by label, not by key", () => {
    // Key order would be ath, ste, med. Label order is the one a player can
    // navigate on a phone with no headings to orient against.
    assert.deepEqual(skills.map(s => s.label), ["Athletics", "Medicine", "Stealth"]);
  });

  it("uses dnd5e's computed total rather than recomputing it", () => {
    const med = skills.find(s => s.key === "med");
    assert.equal(med.total, "+10");
    assert.equal(med.passive, 20);
  });

  it("distinguishes half proficiency from full and from expertise", () => {
    assert.equal(skills.find(s => s.key === "ste").proficiency, "half");
    assert.equal(skills.find(s => s.key === "med").proficiency, "expertise");
    assert.equal(skills.find(s => s.key === "ath").proficiency, "none");
  });

  it("prefers the actor's ability over the config default", () => {
    // A GM or module can move a skill onto a different ability; the actor's own
    // value is the one that governs the roll, so it must be the one displayed.
    const system = {
      skills: { ste: { ability: "wis", total: 4, passive: 14, proficient: 0 } }
    };
    const [stealth] = buildSkills(system, {
      abilities: CONFIG_DND5E.abilities,
      skills: { ste: CONFIG_DND5E.skills.ste }
    });
    assert.equal(stealth.ability, "wis");
    assert.equal(stealth.abilityLabel, "WIS");
  });
});

/* -------------------------------------------- */

describe("buildHeader", () => {
  const header = buildHeader(CLERIC, CONFIG_DND5E);

  it("labels the class with its level", () => {
    assert.equal(header.classes, "Cleric 7");
  });

  it("joins a multiclass character rather than showing only the first class", () => {
    const multi = {
      ...CLERIC,
      classes: {
        cleric: { name: "Cleric", system: { levels: 5 } },
        wizard: { name: "Wizard", system: { levels: 2 } }
      }
    };
    assert.equal(buildHeader(multi, CONFIG_DND5E).classes, "Cleric 5 / Wizard 2");
  });

  it("computes a hit point percentage for the bar", () => {
    assert.equal(header.hp.pct, 100);
    assert.equal(header.hp.bloodied, false);
    assert.equal(header.hp.unconscious, false);
  });

  it("flags bloodied at exactly half, not below it", () => {
    // The 5e condition is "at or below half", and an off-by-one here would
    // leave the bar green on the round it should turn.
    const hurt = buildHeader(clericWith({ hp: { value: 19, max: 38, effectiveMax: 38 } }), CONFIG_DND5E);
    assert.equal(hurt.hp.bloodied, true);
    assert.equal(hurt.hp.unconscious, false);
  });

  it("clamps the bar rather than rendering a negative width", () => {
    const down = buildHeader(clericWith({ hp: { value: -5, max: 38, effectiveMax: 38 } }), CONFIG_DND5E);
    assert.equal(down.hp.pct, 0);
    assert.equal(down.hp.unconscious, true);
  });

  it("prefers effectiveMax so a tempmax adjustment is reflected", () => {
    const drained = buildHeader(
      clericWith({ hp: { value: 20, max: 38, effectiveMax: 30, tempmax: -8 } }),
      CONFIG_DND5E
    );
    assert.equal(drained.hp.max, 30);
    assert.equal(drained.hp.pct, 67);
  });

  it("survives a character with no hit point data at all", () => {
    assert.equal(buildHeader({ name: "Blank", system: {} }, CONFIG_DND5E).hp.pct, 0);
  });

  it("omits the spell save DC for a non-caster instead of showing zero", () => {
    const fighter = buildHeader(clericWith({ spell: undefined }), CONFIG_DND5E);
    assert.equal(fighter.spellDc, null);
  });
});

/* -------------------------------------------- */

describe("buildSenses", () => {
  it("lists only senses the character actually has", () => {
    const senses = buildSenses(CLERIC.system.attributes.senses, CONFIG_DND5E);
    assert.deepEqual(senses, [{ key: "darkvision", label: "Darkvision", range: 60 }]);
  });

  it("returns nothing when the actor has no senses data", () => {
    assert.deepEqual(buildSenses(undefined, CONFIG_DND5E), []);
  });
});

/* -------------------------------------------- */

describe("buildDeathSaves", () => {
  it("returns null above zero hit points, so the sheet stays uncluttered", () => {
    assert.equal(buildDeathSaves(CLERIC.system), null);
  });

  it("appears at exactly zero, which is when the rule starts applying", () => {
    const saves = buildDeathSaves(clericWith({ hp: { value: 0, max: 38 } }).system);
    assert.deepEqual(saves.successes, [false, false, false]);
    assert.deepEqual(saves.failures, [false, false, false]);
  });

  it("fills pips from the left", () => {
    const system = clericWith({
      hp: { value: 0, max: 38 },
      death: { success: 2, failure: 1 }
    }).system;

    const saves = buildDeathSaves(system);
    assert.deepEqual(saves.successes, [true, true, false]);
    assert.deepEqual(saves.failures, [true, false, false]);
  });
});

/* -------------------------------------------- */

describe("buildStatsView", () => {
  it("assembles the whole view model without touching a Foundry global", () => {
    const view = buildStatsView(CLERIC, CONFIG_DND5E);
    assert.equal(view.header.name, "Phonedry Test");
    assert.equal(view.abilities.length, 3);
    assert.equal(view.skills.length, 3);
    assert.equal(view.deathSaves, null);
  });
});
