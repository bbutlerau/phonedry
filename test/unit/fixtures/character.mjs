/**
 * Fixtures for the mapper tests.
 *
 * These are hand-written plain objects rather than a dump of a real actor, and
 * that is the point: a dump would be thousands of lines of dnd5e's derived data
 * and would tell you nothing about which fields the mapper actually depends on.
 * What is here is exactly what `scripts/data/stats.mjs` reads, so if dnd5e moves
 * a field, the fixture is the checklist for what to go and look at.
 *
 * The numbers are drawn from the level 7 cleric in the development world, and
 * are deliberately awkward: a negative Strength modifier, a half-proficient
 * skill and an expertise skill all exist because each one is a case that a
 * naive implementation gets wrong.
 */

/** A minimal stand-in for CONFIG.DND5E. */
export const CONFIG_DND5E = {
  abilities: {
    str: { label: "Strength", abbreviation: "str" },
    dex: { label: "Dexterity", abbreviation: "dex" },
    wis: { label: "Wisdom", abbreviation: "wis" }
  },
  skills: {
    ath: { label: "Athletics", ability: "str" },
    ste: { label: "Stealth", ability: "dex" },
    med: { label: "Medicine", ability: "wis" }
  },
  senses: {
    blindsight: "Blindsight",
    darkvision: "Darkvision"
  }
};

/** A level 7 cleric, conscious and undamaged. */
export const CLERIC = {
  name: "Phonedry Test",
  img: "icons/svg/mystery-man.svg",
  classes: {
    cleric: { name: "Cleric", system: { levels: 7 } }
  },
  system: {
    abilities: {
      str: { value: 8, mod: -1, proficient: 0, save: { value: -1 } },
      dex: { value: 16, mod: 3, proficient: 0, save: { value: 3 } },
      wis: { value: 18, mod: 4, proficient: 1, save: { value: 7 } }
    },
    skills: {
      ath: { ability: "str", total: -1, passive: 9, proficient: 0 },
      ste: { ability: "dex", total: 4, passive: 14, proficient: 0.5 },
      med: { ability: "wis", total: 10, passive: 20, proficient: 2 }
    },
    attributes: {
      hp: { value: 38, max: 38, effectiveMax: 38, temp: null, tempmax: 0 },
      ac: { value: 13 },
      init: { total: 3 },
      movement: { walk: 30, units: "ft" },
      prof: 3,
      spell: { dc: 15, attack: 7, mod: 4, abilityLabel: "Wisdom" },
      death: { success: 0, failure: 0 },
      exhaustion: 0,
      inspiration: false,
      senses: { darkvision: 60, blindsight: 0, tremorsense: 0, truesight: 0 }
    },
    details: {
      level: 7,
      race: "Gnome, Forest"
    }
  }
};

/**
 * Build a variant of the cleric with some system data overridden.
 *
 * @param {object} attributes  Replacement `system.attributes` fields.
 * @returns {object}
 */
export function clericWith(attributes) {
  return {
    ...CLERIC,
    system: {
      ...CLERIC.system,
      attributes: { ...CLERIC.system.attributes, ...attributes }
    }
  };
}
