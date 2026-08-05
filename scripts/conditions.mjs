/**
 * Setting conditions, effects and the other switches on a character.
 *
 * Same division as everywhere else: dnd5e and core own what happens, we own the
 * button.
 *
 * `Actor#toggleStatusEffect` is core's own route and is not worth going around.
 * It creates the effect from the registered status with the right static id, so
 * the condition is recognised as *that* condition by dnd5e, by the token HUD and
 * by every other module — building the effect by hand would produce something
 * that looked identical and was not.
 */

import { attempt } from "./attempt.mjs";

/**
 * Turn a condition on or off.
 *
 * @param {Actor} actor
 * @param {string} id      A status id, e.g. "prone".
 * @param {boolean} active
 * @returns {Promise<*|null>}
 */
export function setCondition(actor, id, active) {
  return attempt(
    () => actor.toggleStatusEffect(id, { active }),
    id,
    "PHONEDRY.Conditions.Failed"
  );
}

/**
 * Set the exhaustion level.
 *
 * Exhaustion is a number rather than a switch, and dnd5e derives the penalties
 * from it — so the level is written to the actor and the system applies the
 * rest. Clamped here only to keep the control honest; dnd5e would reject an
 * out-of-range value anyway.
 *
 * @param {Actor} actor
 * @param {number} level
 * @param {number} max
 * @returns {Promise<Actor|null>}
 */
export function setExhaustion(actor, level, max) {
  const value = Math.clamp(level, 0, max);

  return attempt(
    () => actor.update({ "system.attributes.exhaustion": value }),
    game.i18n.localize("PHONEDRY.Conditions.Exhaustion"),
    "PHONEDRY.Conditions.Failed"
  );
}

/**
 * Enable or disable an effect that arrived from somewhere else.
 *
 * Disabled rather than deleted, deliberately. An effect on a player usually
 * belongs to someone else's spell, and a player who ends it wants it to stop
 * applying, not to erase the record that it was there — and a GM who disagrees
 * can put it back. Deleting is not offered from this sheet.
 *
 * @param {string} uuid
 * @param {boolean} disabled
 * @returns {Promise<*|null>}
 */
export async function setEffectDisabled(uuid, disabled) {
  const effect = await fromUuid(uuid);
  if ( !effect ) return null;

  return attempt(
    () => effect.update({ disabled }),
    effect.name,
    "PHONEDRY.Conditions.Failed"
  );
}

/**
 * Grant or spend inspiration.
 *
 * One boolean, and dnd5e derives nothing from it — inspiration is a token the
 * table passes around, spent by announcing it and rolling with advantage. The
 * sheet's job is to say whether it is held and to let it be let go.
 *
 * Toggled in both directions rather than only spent, because a mis-tap on a
 * phone would otherwise be unrecoverable without asking the GM.
 *
 * @param {Actor} actor
 * @param {boolean} inspired
 * @returns {Promise<Actor|null>}
 */
export function setInspiration(actor, inspired) {
  return attempt(
    () => actor.update({ "system.attributes.inspiration": inspired }),
    game.i18n.localize("PHONEDRY.Sheet.Inspiration"),
    "PHONEDRY.Conditions.Failed"
  );
}

/**
 * Stop concentrating.
 *
 * `Actor#endConcentration` is dnd5e's own route and is not worth going around.
 * It removes the effect, tells the item, and fires the hook other modules watch
 * — deleting the effect by hand would leave the first and skip the rest.
 *
 * The whole of concentration is ended rather than one spell of it, because with
 * dnd5e's default limit of one there is only ever the one. Passing the effect
 * keeps that honest for a character whose features raise the limit.
 *
 * @param {Actor} actor
 * @param {string} uuid  The concentration effect's uuid.
 * @returns {Promise<*|null>}
 */
export async function endConcentration(actor, uuid) {
  const effect = await fromUuid(uuid);
  if ( !effect ) return null;

  return attempt(
    () => actor.endConcentration(effect),
    effect.name,
    "PHONEDRY.Conditions.Failed"
  );
}
