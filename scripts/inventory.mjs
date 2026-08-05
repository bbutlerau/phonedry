/**
 * Equipping and attuning.
 *
 * Same division as everywhere else: dnd5e owns what happens, we own the button.
 *
 * Both of these are single-field writes on the item, which is the whole of the
 * work — dnd5e derives everything downstream. Equipping a shield moves armour
 * class, equipping a weapon puts it on the actions screen, and attuning an item
 * makes its active effects apply and counts against the character's three. None
 * of that is ours to compute, and none of it needs telling: `updateItem` is
 * already one of the hooks the shell re-renders on, and dnd5e's own preparation
 * runs before it fires.
 *
 * Neither is guarded against being "wrong". A fourth attunement and a second
 * two-handed weapon are both rules questions with a GM on the other side of
 * them, and dnd5e itself refuses neither — it counts attunements and leaves the
 * ruling to the table. A sheet that blocked the tap would be enforcing a rule
 * the system does not, from a phone, mid-session.
 */

import { attempt } from "./attempt.mjs";

/**
 * Equip or stow an item.
 *
 * @param {Item} item
 * @param {boolean} equipped
 * @returns {Promise<Item|null>}
 */
export function setEquipped(item, equipped) {
  return attempt(
    () => item.update({ "system.equipped": equipped }),
    item.name,
    "PHONEDRY.Items.Failed"
  );
}

/**
 * Attune to an item, or let the attunement go.
 *
 * @param {Item} item
 * @param {boolean} attuned
 * @returns {Promise<Item|null>}
 */
export function setAttuned(item, attuned) {
  return attempt(
    () => item.update({ "system.attuned": attuned }),
    item.name,
    "PHONEDRY.Items.Failed"
  );
}
