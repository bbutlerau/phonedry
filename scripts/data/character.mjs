/**
 * Deciding which actor the sheet shows.
 *
 * On a desktop client this question barely exists — the sidebar lists every
 * actor and the player picks one. Phonedry has no sidebar, so the choice has to
 * be made for them, and getting it wrong means an empty screen with no obvious
 * way forward.
 */

/**
 * Find the actor this user's sheet should show.
 *
 * Three sources, in descending order of confidence:
 *
 * 1. The user's assigned character. This is what the GM set on the user, and it
 *    is the answer whenever it exists.
 * 2. The only character actor they own. A world where the GM never got around
 *    to assigning characters is common, and if there is exactly one candidate
 *    there is nothing to be gained by asking.
 * 3. Nothing, or several. Both are reported rather than guessed at: picking
 *    arbitrarily between two characters someone owns would be worse than saying
 *    plainly that a choice is needed.
 *
 * Only `character`-type actors are considered. A player who owns an NPC or a
 * vehicle — a familiar, a party wagon — should not have it silently promoted
 * into the slot where their own character belongs.
 *
 * @param {User} user
 * @returns {{actor: Actor|null, candidates: Actor[], reason: string}}
 *   `reason` is one of "assigned", "sole-owned", "none" or "ambiguous", and is
 *   what the empty state uses to explain itself.
 */
export function resolveCharacter(user) {
  const owned = game.actors.filter(a => (a.type === "character") && a.testUserPermission(user, "OWNER"));

  if ( user.character ) return { actor: user.character, candidates: owned, reason: "assigned" };
  if ( owned.length === 1 ) return { actor: owned[0], candidates: owned, reason: "sole-owned" };

  return {
    actor: null,
    candidates: owned,
    reason: owned.length ? "ambiguous" : "none"
  };
}
