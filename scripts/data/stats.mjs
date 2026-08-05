/**
 * The actor → view model mapper for the stats screen.
 *
 * Everything here is pure and synchronous: it takes an actor-shaped object and
 * dnd5e's config object, and returns plain data. No Foundry globals, no DOM, no
 * promises. That is deliberate — this is the layer that breaks when dnd5e
 * changes its data model between majors, so it is the layer worth testing, and
 * it can only be cheaply tested if it depends on nothing.
 *
 * The rule that keeps it honest: read dnd5e's *derived* values, never recompute
 * them. `skills.ath.total` already accounts for proficiency, expertise, ability
 * modifier, racial bonuses and every active effect in play. Adding a modifier
 * to a proficiency bonus ourselves would produce a number that is right on a
 * plain character and quietly wrong on an interesting one.
 */

/**
 * Format a modifier the way a character sheet does — always signed, so a column
 * of them lines up and a zero reads as "+0" rather than an absent value.
 *
 * @param {number} value
 * @returns {string}
 */
export function formatModifier(value) {
  const n = Number(value) || 0;
  return n < 0 ? `${n}` : `+${n}`;
}

/**
 * Describe a proficiency multiplier as a CSS-friendly token.
 *
 * dnd5e stores proficiency as a multiplier — 0, 0.5, 1 or 2 — rather than a
 * flag, because half proficiency and expertise both exist. The sheet shows
 * these as an open, half, full or double pip, so the template needs a name for
 * each rather than a number to compare against.
 *
 * @param {number} multiplier
 * @returns {"none"|"half"|"proficient"|"expertise"}
 */
export function proficiencyLevel(multiplier) {
  if ( multiplier >= 2 ) return "expertise";
  if ( multiplier >= 1 ) return "proficient";
  if ( multiplier > 0 ) return "half";
  return "none";
}

/* -------------------------------------------- */

/**
 * Build the ability rows: score, modifier, and saving throw.
 *
 * Iterating `config.abilities` rather than the actor's own ability object is
 * what keeps custom abilities working — modules that add one register it in
 * CONFIG, and a character that has never rolled it may not have the key.
 *
 * @param {object} system  The actor's `system` data.
 * @param {object} config  `CONFIG.DND5E`.
 * @returns {object[]}
 */
export function buildAbilities(system, config) {
  return Object.entries(config.abilities ?? {}).map(([key, ability]) => {
    const data = system.abilities?.[key] ?? {};
    return {
      key,
      label: ability.label,
      abbreviation: (ability.abbreviation ?? key).toUpperCase(),
      score: data.value ?? 10,
      mod: formatModifier(data.mod),
      save: formatModifier(data.save?.value),
      saveProficiency: proficiencyLevel(data.proficient ?? 0)
    };
  });
}

/* -------------------------------------------- */

/**
 * Build the skill rows, sorted by their displayed label.
 *
 * Sorting by label rather than by dnd5e's key order matters more here than on a
 * desktop sheet: this is a long scrolling list on a phone with no column
 * headings to orient against, so alphabetical is the only order a player can
 * navigate by. It also puts the list in the right order under localisation,
 * which a fixed key order would not.
 *
 * @param {object} system  The actor's `system` data.
 * @param {object} config  `CONFIG.DND5E`.
 * @returns {object[]}
 */
export function buildSkills(system, config) {
  return Object.entries(config.skills ?? {})
    .map(([key, skill]) => {
      const data = system.skills?.[key] ?? {};
      const ability = data.ability ?? skill.ability;
      return {
        key,
        label: skill.label,
        ability,
        abilityLabel: (config.abilities?.[ability]?.abbreviation ?? ability ?? "").toUpperCase(),
        total: formatModifier(data.total),
        passive: data.passive ?? null,
        proficiency: proficiencyLevel(data.proficient ?? 0)
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}

/* -------------------------------------------- */

/**
 * Build the header: who this is, and the handful of numbers a player checks
 * constantly enough that they must never be more than a glance away.
 *
 * Hit points are the one value here the player also *edits* mid-session, which
 * is why the raw numbers come through alongside the formatted ones.
 *
 * @param {object} actor   An actor-shaped object: `name`, `system`, `classes`.
 * @param {object} config  `CONFIG.DND5E`.
 * @returns {object}
 */
export function buildHeader(actor, config) {
  const system = actor.system ?? {};
  const attributes = system.attributes ?? {};
  const hp = attributes.hp ?? {};

  // `effectiveMax` folds in the tempmax adjustment; falling back to `max` keeps
  // this working against older data that predates it.
  const max = hp.effectiveMax ?? hp.max ?? 0;
  const value = hp.value ?? 0;

  const classes = Object.values(actor.classes ?? {})
    .map(c => (c.system?.levels ? `${c.name} ${c.system.levels}` : c.name))
    .join(" / ");

  return {
    name: actor.name,
    img: actor.img ?? null,
    level: system.details?.level ?? null,
    classes: classes || null,
    race: system.details?.race?.name ?? system.details?.race ?? null,

    hp: {
      value,
      max,
      temp: hp.temp || 0,

      // Clamped because a character can be at negative hit points in some
      // house rules, and a negative-width bar renders as a visual glitch
      // rather than as information.
      pct: max > 0 ? Math.max(0, Math.min(100, Math.round((value / max) * 100))) : 0,
      bloodied: (max > 0) && (value <= max / 2),
      unconscious: value <= 0
    },

    ac: attributes.ac?.value ?? null,
    initiative: formatModifier(attributes.init?.total),
    proficiency: formatModifier(attributes.prof),
    speed: attributes.movement?.walk ?? null,
    speedUnits: attributes.movement?.units ?? "ft",

    // Only meaningful for casters. Null rather than zero so the template can
    // leave the slot out entirely for a fighter instead of showing "DC 0".
    spellDc: attributes.spell?.dc ?? null,
    spellAbility: attributes.spell?.abilityLabel ?? null,

    exhaustion: attributes.exhaustion || 0,
    inspiration: !!attributes.inspiration,
    senses: buildSenses(attributes.senses, config)
  };
}

/**
 * Collect the non-zero special senses into a short display list.
 *
 * Zero-valued senses are dropped rather than shown as "Darkvision 0", which is
 * noise on a screen where every row costs real estate.
 *
 * @param {object} senses
 * @param {object} config  `CONFIG.DND5E`.
 * @returns {object[]}
 */
export function buildSenses(senses = {}, config = {}) {
  return Object.entries(config.senses ?? {})
    .map(([key, label]) => ({ key, label, range: senses[key] ?? 0 }))
    .filter(s => s.range > 0);
}

/* -------------------------------------------- */

/**
 * Death saving throws, or null when they do not apply.
 *
 * Returning null above zero hit points is the whole point: death saves are the
 * most important thing on the screen for as long as they are relevant and pure
 * clutter the rest of the time, so the sheet shows them only when the character
 * is actually down.
 *
 * @param {object} system  The actor's `system` data.
 * @returns {{successes: boolean[], failures: boolean[]}|null}
 */
export function buildDeathSaves(system) {
  const attributes = system.attributes ?? {};
  if ( (attributes.hp?.value ?? 1) > 0 ) return null;

  const death = attributes.death ?? {};
  const pips = filled => [0, 1, 2].map(i => i < filled);

  return {
    successes: pips(death.success ?? 0),
    failures: pips(death.failure ?? 0)
  };
}

/* -------------------------------------------- */

/**
 * Build the whole stats view model in one call.
 *
 * @param {object} actor   An actor-shaped object.
 * @param {object} config  `CONFIG.DND5E`.
 * @returns {object}
 */
export function buildStatsView(actor, config) {
  const system = actor.system ?? {};
  return {
    header: buildHeader(actor, config),
    abilities: buildAbilities(system, config),
    skills: buildSkills(system, config),
    deathSaves: buildDeathSaves(system)
  };
}
