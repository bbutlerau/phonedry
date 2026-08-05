/**
 * Casting and preparing spells.
 *
 * Same division as everywhere else: dnd5e owns what happens, we own the button.
 *
 * Casting in particular is not something to reimplement. `Item5e#use` runs the
 * activity, which consumes the right slot at the right level, spends limited
 * uses, applies consumption of materials, rolls attack or damage through the
 * usual pipeline, and posts a chat card other modules can act on. The parts of
 * that we would get wrong are the parts nobody notices until a session.
 */

/**
 * Run an operation, reporting failures to the player rather than the console.
 *
 * @param {Function} fn
 * @param {string} describe
 * @returns {Promise<*|null>}
 */
async function attempt(fn, describe) {
  try {
    return await fn();
  } catch ( error ) {
    console.error("phonedry | spell action failed", error);
    ui.notifications?.error(game.i18n.format("PHONEDRY.Spells.Failed", { what: describe }));
    return null;
  }
}

/**
 * Cast a spell.
 *
 * dnd5e may put a usage dialog in front of this — choosing a slot level, or
 * confirming consumption. That dialog is the system's, and on WebKit it is the
 * component this module has had the most trouble with, so it is worth checking
 * on a device whenever this path changes.
 *
 * @param {Item} spell
 * @returns {Promise<object|null>}
 */
export function castSpell(spell) {
  return attempt(() => spell.use(), `${spell.name}`);
}

/**
 * Prepare or unprepare a spell.
 *
 * Only meaningful for slot-cast spells belonging to a preparing caster; the
 * sheet decides which those are, and does not offer the control otherwise.
 *
 * @param {Item} spell
 * @param {boolean} prepared
 * @returns {Promise<Item|null>}
 */
export function setPrepared(spell, prepared) {
  return attempt(
    () => spell.update({ "system.prepared": prepared ? 1 : 0 }),
    game.i18n.localize("PHONEDRY.Spells.Preparation")
  );
}
