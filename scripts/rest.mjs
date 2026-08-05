/**
 * Resting.
 *
 * Entirely dnd5e's, and deliberately so. A rest is one of the densest pieces of
 * rules logic in the system: it spends hit dice and rolls them, recovers spell
 * slots by preparation method, refreshes limited uses on the right recovery
 * period, adjusts exhaustion, advances time, handles the gritty and epic rest
 * variants, and fires hooks other modules hang recovery off. A hand-built
 * version would be wrong in ways nobody notices until the session after.
 *
 * So this keeps dnd5e's own rest dialog rather than suppressing it. That is the
 * opposite of the choice made for initiative — where the dialog was only
 * collecting an advantage mode the sheet already knew — and it is the right one
 * here, because the dialog is *where hit dice are spent*. Removing it would
 * mean rebuilding that.
 */

import { attempt } from "./attempt.mjs";

/**
 * Take a rest.
 *
 * @param {Actor} actor
 * @param {string} type  "short" or "long".
 * @returns {Promise<object|null>}
 */
export function takeRest(actor, type) {
  const label = CONFIG.DND5E.restTypes?.[type]?.label ?? type;

  return attempt(
    () => (type === "long") ? actor.longRest() : actor.shortRest(),
    label,
    "PHONEDRY.Rest.Failed"
  );
}
