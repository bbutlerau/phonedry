/**
 * Using an activity.
 *
 * Same division as everywhere else: dnd5e owns what happens, we own the button.
 *
 * `Activity#use` is the whole of it, and going through it rather than
 * `Item#use` is the point of this screen. `Item#use` on a multi-activity item —
 * Channel Divinity, with its three — opens a dialog asking which one; the
 * actions screen has already asked that question by giving each activity its
 * own row, so calling the activity directly means the tap does the thing.
 *
 * dnd5e may still put its own usage dialog in front of this, to spend uses or
 * place a template. That dialog is the system's, it carries rules logic we have
 * no business reimplementing, and it is the component that has given WebKit the
 * most trouble — so this path is worth checking on a device whenever it changes.
 */

import { attempt } from "./attempt.mjs";

/**
 * Find an activity by the composite key the template carries.
 *
 * Two ids are needed because an activity is only unique within its item, and
 * both travel on the row as separate data attributes.
 *
 * @param {Actor} actor
 * @param {string} itemId
 * @param {string} activityId
 * @returns {Activity|null}
 */
export function findActivity(actor, itemId, activityId) {
  const item = actor?.items.get(itemId);
  return item?.system?.activities?.get(activityId) ?? null;
}

/**
 * Use an activity.
 *
 * @param {Actor} actor
 * @param {string} itemId
 * @param {string} activityId
 * @returns {Promise<object|null>}
 */
export function useActivity(actor, itemId, activityId) {
  const activity = findActivity(actor, itemId, activityId);
  if ( !activity ) return Promise.resolve(null);

  return attempt(
    () => activity.use(),

    // The item's name, not the activity's: "Attack" alone would not identify
    // which of three weapons failed.
    activity.item?.name ?? activity.name,
    "PHONEDRY.Actions.Failed"
  );
}
