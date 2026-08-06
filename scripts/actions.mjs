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
 *
 * An activity that targets creatures gets the same treatment `castSpell` gives
 * a spell: the shell collects a target choice first and hands it in as message
 * flags, because `game.user.targets` — what dnd5e would otherwise read this
 * from — is permanently empty on a client with no canvas.
 *
 * An attack roll gets one thing more: dnd5e's own `Activity#use` normally
 * triggers the attack roll itself immediately afterward, through
 * `_triggerSubsequentActions`, but that inner call hardcodes an unconfigured
 * roll dialog — it does not forward whatever dialog options `use` was given.
 * Left alone, every attack from this screen would pop dnd5e's own
 * advantage/normal/disadvantage prompt regardless of what the header's
 * selector already says, which is the one dialog this module exists to
 * remove. `subsequentActions: false` stops that automatic roll, and
 * `rollAttack` is then called directly with the header's mode and its own
 * dialog suppressed — the same `{configure: false}` pattern `rolls.mjs` uses
 * for every other d20 roll on the sheet.
 *
 * This is specific to attacks. Damage and healing rolls have no
 * advantage/disadvantage of their own to configure — that is a d20 concept,
 * and neither rolls a d20 — so the same automatic trigger for those already
 * completes without a dialog in the way, and is left alone.
 */

import { attempt } from "./attempt.mjs";
import { modeFlags, ROLL_MODE } from "./rolls.mjs";

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
 * @param {object[]} [targets]  Chosen targets, in dnd5e's own descriptor shape —
 *                              see `castSpell` in `spells.mjs` for why this is
 *                              handed in as message flags rather than left for
 *                              dnd5e to read off the canvas.
 * @param {string} [mode]  A `ROLL_MODE` value, read only for an attack — see
 *                          the note above `findActivity` for why.
 * @returns {Promise<object|null>}
 */
export function useActivity(actor, itemId, activityId, targets = [], mode = ROLL_MODE.NORMAL) {
  const activity = findActivity(actor, itemId, activityId);
  if ( !activity ) return Promise.resolve(null);

  const message = targets.length
    ? { data: { flags: { dnd5e: { targets } } } }
    : {};

  // The item's name, not the activity's: "Attack" alone would not identify
  // which of three weapons failed.
  const label = activity.item?.name ?? activity.name;

  if ( activity.type === "attack" ) {
    return attempt(async () => {
      await activity.use({ subsequentActions: false }, {}, message);
      return activity.rollAttack({ ...modeFlags(mode) }, { configure: false }, message);
    }, label, "PHONEDRY.Actions.Failed");
  }

  return attempt(() => activity.use({}, {}, message), label, "PHONEDRY.Actions.Failed");
}
