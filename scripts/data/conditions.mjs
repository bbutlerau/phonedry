/**
 * The actor → view model mapper for the conditions screen.
 *
 * Pure and synchronous like the other mappers.
 *
 * Two quite different things share this screen, and keeping them apart is the
 * whole design. A **condition** is something a player sets on themselves — you
 * are prone because you dropped prone, and you clear it when you stand up. An
 * **effect** is something that arrived from elsewhere: a Bless someone cast on
 * you, a Rage your own feature turned on. The first is a switch; the second is
 * a record of something that happened, which a player mostly needs to *see*.
 *
 * Presenting them as one undifferentiated list of toggles is the mistake worth
 * avoiding: it invites a player to switch off a spell someone else is
 * concentrating on and assume that ended it.
 */

/**
 * Conditions that carry a level rather than being on or off.
 *
 * Only exhaustion, but read from config rather than hard-coded, because dnd5e
 * changed exhaustion twice between 2014 and 2024 and the number of levels is
 * exactly the kind of thing that moves again.
 *
 * @param {object} entry  A `CONFIG.DND5E.conditionTypes` entry.
 * @returns {number|null}
 */
export function levelsFor(entry) {
  return Number.isFinite(entry?.levels) ? entry.levels : null;
}

/* -------------------------------------------- */

/**
 * The standard conditions, as toggle rows.
 *
 * `pseudo` entries are dropped, following dnd5e's own effects tab. They are
 * markers the system uses internally — bleeding, burning — rather than
 * conditions in the rules, and a player toggling one would be inventing a rule.
 *
 * @param {object} config       `CONFIG.DND5E`.
 * @param {Set<string>} statuses  The actor's active status ids.
 * @param {object} system       The actor's `system` data.
 * @returns {object[]}
 */
export function buildConditions(config = {}, statuses = new Set(), system = {}) {
  return Object.entries(config.conditionTypes ?? {})
    .filter(([, entry]) => !entry.pseudo)
    .map(([id, entry]) => {
      const levels = levelsFor(entry);

      return {
        id,
        name: entry.name,
        img: entry.img,

        // The rule that defines it, so a hold can show what being grappled
        // actually does. Same mechanism as the skills list.
        reference: entry.reference ?? null,

        // Core keeps this set in step with the effects on the actor, so it is
        // the honest answer to "is this on" — a condition whose effect has been
        // disabled correctly reads as off.
        active: statuses.has(id),

        levels,
        level: levels ? (system.attributes?.exhaustion ?? 0) : null
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/* -------------------------------------------- */

/**
 * Describe an active effect for display.
 *
 * @param {object} effect
 * @returns {object}
 */
export function describeEffect(effect) {
  // An effect transferred from an item has that item as its parent, which is
  // the useful thing to name: "Rage" tells a player less than "Rage — Barbarian
  // feature" when they are trying to work out why their sheet changed.
  const parent = effect.parent;
  const fromItem = parent && (parent.documentName === "Item");

  return {
    uuid: effect.uuid,
    name: effect.name,
    img: effect.img,
    disabled: !!effect.disabled,

    // dnd5e's own word for "has a duration", which is what separates a spell
    // someone cast on you from a permanent trait of your species.
    temporary: !!effect.isTemporary,
    suppressed: !!effect.isSuppressed,

    source: fromItem ? parent.name : null,
    sourceType: fromItem ? parent.type : null,

    // Foundry composes this — "1 minute", "3 rounds" — and it is the first
    // thing anyone asks about an effect on them.
    duration: effect.duration?.label || null
  };
}

/* -------------------------------------------- */

/**
 * Build the whole conditions view model.
 *
 * @param {object} actor     An actor-shaped object.
 * @param {object[]} effects  Every effect applying to the actor.
 * @param {object} config    `CONFIG.DND5E`.
 * @returns {object}
 */
export function buildConditionsView(actor, effects = [], config = {}) {
  const statuses = actor.statuses ?? new Set();
  const conditions = buildConditions(config, statuses, actor.system ?? {});

  /*
   * Conditions are already shown above as toggles, so their effects are
   * dropped here rather than listed twice under a different name. Matched on
   * the status rather than on the name: a condition effect carries the status
   * id whatever it happens to be called.
   */
  const conditionIds = new Set(conditions.map(c => c.id));

  const applied = effects
    .filter(effect => ![...(effect.statuses ?? [])].some(s => conditionIds.has(s)))
    .map(describeEffect)

    // Only the temporary ones. Passive effects are a character's permanent
    // traits — darkvision from a species, a bonus from a feat — and they are
    // not things happening *to* the character, which is what this screen is
    // about. Listing them would bury the Bless among two dozen entries nobody
    // needs to read mid-fight.
    .filter(effect => effect.temporary)
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    conditions,
    applied,

    // Counted for the tab badge: whether anything is on you at all is the
    // question this screen exists to answer, and it should be answerable
    // without opening it.
    activeCount: conditions.filter(c => c.active).length + applied.filter(e => !e.disabled).length,

    noneApplied: applied.length === 0
  };
}
