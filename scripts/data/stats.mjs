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
        proficiency: proficiencyLevel(data.proficient ?? 0),

        // Where dnd5e keeps the rule for this skill, as a uuid into its own
        // reference compendium. A skill is not an item, so this is the only
        // thing there is to read when one is held — and it is what a player
        // actually wants at the table, which is what the skill covers rather
        // than how the number was arrived at. Null where the reference
        // compendium is not installed, in which case the row offers no hold.
        reference: skill.reference ?? null
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}

/* -------------------------------------------- */

/**
 * Tool proficiencies, as rollable checks.
 *
 * Only the tools the character is actually trained in. dnd5e knows about forty
 * of them and a character has one or two, so listing the rest would bury the
 * ones that matter under a screen of zeroes — which is the opposite of the
 * skills list, where every skill is rollable whether you are proficient or not.
 *
 * The ability comes from the actor rather than from config, because dnd5e lets
 * a feature move a tool onto a different ability and the actor is where that
 * lands.
 *
 * Labels are handed in rather than looked up: a tool's name lives on a
 * compendium item, and resolving it needs `dnd5e.documents.Trait` — which this
 * mapper must stay free of to be testable.
 *
 * @param {object} system   The actor's `system` data.
 * @param {object} config   `CONFIG.DND5E`.
 * @param {object} [labels] Tool names, keyed as `system.tools` is.
 * @returns {object[]}
 */
export function buildTools(system, config = {}, labels = {}) {
  return Object.entries(system?.tools ?? {})
    .map(([key, data]) => {
      const ability = data.ability ?? config.tools?.[key]?.ability;

      return {
        key,
        label: labels[key] ?? key,
        ability,
        abilityLabel: (config.abilities?.[ability]?.abbreviation ?? ability ?? "").toUpperCase(),
        total: formatModifier(data.total),
        proficiency: proficiencyLevel(data.value ?? 0)
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
/**
 * The rest types offered in the header.
 *
 * Read from dnd5e's config rather than written out, so the labels are the
 * system's own words in the player's own language, and so the icons match the
 * ones they see everywhere else in Foundry.
 *
 * @param {object} config  `CONFIG.DND5E`.
 * @returns {object[]}
 */
export function buildRests(config = {}) {
  return ["short", "long"].map(id => {
    const rest = config.restTypes?.[id] ?? {};
    return {
      id,

      // dnd5e's full wording — "Short Rest" — for the accessible name, where
      // there is no width to fight over.
      label: rest.label ?? id,

      // One word for the button face. Only the first word distinguishes the
      // two, and the second would force the button wider than hit points can
      // spare. Ours rather than a split of dnd5e's, because taking the first
      // word of a translated string is not a safe thing to do.
      short: `PHONEDRY.Rest.${id === "long" ? "Long" : "Short"}`,

      icon: rest.icon ?? "fa-solid fa-bed"
    };
  });
}

/* -------------------------------------------- */

/**
 * Hit dice, or null for a character with none.
 *
 * The pool is what a short rest spends, and until now there was no way to see
 * it from a phone at all — so a player could not tell whether resting was worth
 * anything. Spending them stays dnd5e's job: its rest dialog handles which die
 * to roll and how much it heals, and that is rules logic we have no business
 * reimplementing.
 *
 * @param {object} attributes  The actor's `system.attributes`.
 * @returns {object|null}
 */
export function buildHitDice(attributes = {}) {
  const hd = attributes.hd ?? {};
  if ( !(hd.max > 0) ) return null;

  return {
    value: hd.value ?? 0,
    max: hd.max,

    // dnd5e works this out across a multiclassed character's several pools,
    // which is exactly the sum nobody wants to do at the table.
    largest: hd.largestAvailable ?? null,

    spent: (hd.value ?? 0) <= 0
  };
}

/* -------------------------------------------- */

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

    // What a short rest spends. Null for anything with no pool, so the
    // template leaves the readout out rather than showing "0/0".
    hitDice: buildHitDice(attributes),

    // Short and long, in dnd5e's own words.
    rests: buildRests(config),

    exhaustion: attributes.exhaustion || 0,

    inspiration: !!attributes.inspiration,

    // The rule that defines it, so holding the chip says what inspiration is
    // for — the same mechanism the skills and conditions lists use. dnd5e
    // points at its own reference compendium, and the page is absent in a world
    // without it installed, so this is null rather than a dead hold.
    inspirationRule: config.rules?.inspiration ?? null,

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
 * @param {object} actor       An actor-shaped object.
 * @param {object} config      `CONFIG.DND5E`.
 * @param {object} [toolLabels] Tool names, keyed as `system.tools` is.
 * @returns {object}
 */
export function buildStatsView(actor, config, toolLabels = {}) {
  const system = actor.system ?? {};
  return {
    header: buildHeader(actor, config),
    abilities: buildAbilities(system, config),
    skills: buildSkills(system, config),
    tools: buildTools(system, config, toolLabels),
    deathSaves: buildDeathSaves(system)
  };
}
