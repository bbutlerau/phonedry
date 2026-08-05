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
 * Render a bonus with an explicit sign, as a saving throw is written.
 *
 * `+0` rather than `0`, because the sign is what says this is a modifier to a
 * d20 rather than a target number.
 *
 * @param {number} value
 * @returns {string}
 */
function formatModifier(value) {
  const n = Number(value) || 0;
  return (n >= 0) ? `+${n}` : String(n);
}

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
 * The status id dnd5e marks a concentration effect with.
 *
 * Core's `CONFIG.specialStatusEffects.CONCENTRATING`, which is "concentrating"
 * in every build so far. Named here rather than read from config because the
 * mapper must stay free of Foundry globals to be unit-testable, and the caller
 * has no more authority on the value than this does.
 */
export const CONCENTRATING = "concentrating";

/**
 * What the character is concentrating on.
 *
 * This is the thing most often forgotten at a table: a spell quietly stays
 * running for an hour of play after the damage that should have ended it,
 * because nothing on a sheet ever mentioned it again. So it gets its own
 * section at the top of the screen rather than a row among the effects.
 *
 * dnd5e resolves the effects and their spells itself through
 * `Actor#concentration`, which reaches an item even when the spell was cast
 * from a scroll that no longer exists. Collecting that is the caller's job;
 * shaping it is this one's.
 *
 * @param {object[]} effects   The concentration effects, from `actor.concentration`.
 * @param {object[]} items     The spells being concentrated on.
 * @param {object} attributes  The actor's `system.attributes`.
 * @returns {object}
 */
export function buildConcentration(effects = [], items = [], attributes = {}) {
  const spells = new Map(items.map(item => [item.id, item]));

  return {
    active: effects.length > 0,

    // The save that keeps it. Shown beside the button rather than left to the
    // chat card, because the question asked when damage lands is "what am I
    // rolling", and it is the one number on this screen that is not obvious.
    save: formatModifier(attributes.concentration?.save ?? 0),

    entries: effects.map(effect => {
      // The effect is named after the spell, but the spell is what carries the
      // artwork and the description worth holding to read.
      const spell = spells.get(effect.getFlag?.("dnd5e", "item")?.id)
        ?? [...spells.values()][0]
        ?? null;

      return {
        uuid: effect.uuid,
        name: spell?.name ?? effect.name,
        img: spell?.img ?? effect.img,
        itemId: spell?.id ?? null,

        // Foundry composes this — "1 minute", "10 rounds" — and how long there
        // is left to hold it is the second question after what it is.
        duration: effect.duration?.label || null
      };
    })
  };
}

/* -------------------------------------------- */

/**
 * Build the whole conditions view model.
 *
 * @param {object} actor      An actor-shaped object.
 * @param {object[]} effects  Every effect applying to the actor.
 * @param {object} config     `CONFIG.DND5E`.
 * @param {object} [concentration]  `actor.concentration`, as dnd5e resolves it.
 * @returns {object}
 */
export function buildConditionsView(actor, effects = [], config = {}, concentration = {}) {
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

    /*
     * Concentration gets its own section above, so its effect is dropped here
     * for the same reason the conditions are. It is not in
     * `CONFIG.DND5E.conditionTypes` — dnd5e marks it through core's special
     * status effects instead — so the filter above does not catch it, and
     * without this the spell being concentrated on appears twice under two
     * different sets of controls.
     */
    .filter(effect => !(effect.statuses ?? new Set()).has?.(CONCENTRATING))
    .map(describeEffect)

    // Only the temporary ones. Passive effects are a character's permanent
    // traits — darkvision from a species, a bonus from a feat — and they are
    // not things happening *to* the character, which is what this screen is
    // about. Listing them would bury the Bless among two dozen entries nobody
    // needs to read mid-fight.
    .filter(effect => effect.temporary)
    .sort((a, b) => a.name.localeCompare(b.name));

  const concentrating = buildConcentration(
    [...(concentration.effects ?? [])],
    [...(concentration.items ?? [])],
    actor.system?.attributes ?? {}
  );

  return {
    conditions,
    applied,
    concentration: concentrating,

    // Counted for the tab badge: whether anything is on you at all is the
    // question this screen exists to answer, and it should be answerable
    // without opening it.
    activeCount: conditions.filter(c => c.active).length + applied.filter(e => !e.disabled).length
      + concentrating.entries.length,

    noneApplied: applied.length === 0
  };
}
