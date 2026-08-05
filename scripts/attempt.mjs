/**
 * Running a dnd5e operation on the player's behalf.
 *
 * Everything this module does to an actor goes through the system's own API,
 * and any of it can reject — a spell with no slot left, an item deleted by the
 * GM mid-session, a third-party module vetoing the use. On a phone there is no
 * console to look at and no chat log visible, so a rejection that only reaches
 * `console.error` is a button that silently does nothing.
 */

/**
 * Run an operation, reporting failure to the player rather than only the console.
 *
 * @param {Function} fn        The operation.
 * @param {string} what        What was being attempted, for the message.
 * @param {string} [message]   Localisation key for the failure message.
 * @returns {Promise<*|null>}  The result, or null if it failed.
 */
export async function attempt(fn, what, message = "PHONEDRY.Failed") {
  try {
    return await fn();
  } catch ( error ) {
    console.error("phonedry | action failed", error);
    ui.notifications?.error(game.i18n.format(message, { what }));
    return null;
  }
}
