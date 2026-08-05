/**
 * Turning chat messages into something a player can read on a phone.
 *
 * This exists because of a hole the module's own design opened. Foundry shows
 * roll results in chat, chat lives in the sidebar, and Phonedry suppresses the
 * sidebar — so before this, tapping a skill produced a perfectly correct roll
 * that the player had no way of seeing. The dice went into a room they were not
 * in.
 *
 * It is deliberately not a chat client. It shows what was rolled and what it
 * came to, for this character, and nothing else: no message text, no cards, no
 * whispers, no other players' rolls. That keeps it a display of the sheet's own
 * output rather than a second interface to maintain.
 *
 * Pure and synchronous, like the stats mapper, and tested the same way.
 */

/** How many rolls to keep. Older ones are of no interest on a phone. */
export const ROLL_LOG_LIMIT = 20;

/**
 * How many dice to show individually before summarising.
 *
 * A d20 test shows one or two dice and they matter — which was kept, whether it
 * was a natural 20. A damage roll can be eight or more, where the individual
 * faces are noise next to the total.
 */
export const MAX_SHOWN_DICE = 6;

/**
 * Is this message a roll belonging to this player's character?
 *
 * Both the author and the speaker are checked, and the second is not
 * redundant: a GM rolling a saving throw on someone's behalf produces a message
 * this player did not author but very much wants to see.
 *
 * @param {ChatMessage} message
 * @param {{userId: string, actorId: string|null}} viewer
 * @returns {boolean}
 */
export function isOwnRoll(message, { userId, actorId }) {
  if ( !message?.rolls?.length ) return false;
  if ( message.author?.id === userId ) return true;
  return !!actorId && (message.speaker?.actor === actorId);
}

/**
 * Describe one die result.
 *
 * @param {object} result   A DiceTerm result: `{result, active, discarded}`.
 * @param {number} faces
 * @returns {object}
 */
function describeDie(result, faces) {
  const value = result.result;
  return {
    value,

    // Advantage and disadvantage both roll two dice and throw one away. Showing
    // which was discarded is most of the point of showing the dice at all —
    // without it, an advantage roll looks like a single d20 that disagrees with
    // the total.
    dropped: (result.active === false) || !!result.discarded,

    // Only meaningful on a d20, where a natural 1 or 20 is an event in itself
    // rather than just a low or high number.
    natural20: (faces === 20) && (value === 20),
    natural1: (faces === 20) && (value === 1)
  };
}

/**
 * Build the view model for a rolled chat message.
 *
 * @param {ChatMessage} message
 * @returns {object|null} Null if the message carries no roll.
 */
export function describeRoll(message) {
  const roll = message?.rolls?.[0];
  if ( !roll ) return null;

  const dice = (roll.dice ?? []).flatMap(
    term => (term.results ?? []).map(result => describeDie(result, term.faces))
  );

  return {
    id: message.id,

    // dnd5e already puts the ability and skill in the flavour, and appends
    // "(Advantage)" itself, so there is nothing to add and nothing to localise.
    flavor: message.flavor || roll.formula,

    total: roll.total,
    formula: roll.formula,

    // These are dnd5e's own judgement rather than a comparison against 20 — a
    // character with an improved critical range crits on 19, and only the
    // system knows that.
    critical: roll.isCritical === true,
    fumble: roll.isFumble === true,

    dice: dice.slice(0, MAX_SHOWN_DICE),
    moreDice: Math.max(0, dice.length - MAX_SHOWN_DICE)
  };
}

/**
 * Add a roll to the front of the log, keeping it to its limit.
 *
 * Newest first, because on a phone the top of a list is where the eye lands and
 * the newest roll is the only one anyone is looking for.
 *
 * Returns a new array rather than mutating: the log is render state, and
 * mutating it in place makes it impossible to tell whether a re-render is
 * needed.
 *
 * @param {object[]} log
 * @param {object} entry
 * @returns {object[]}
 */
export function pushRoll(log, entry) {
  if ( !entry ) return log;
  return [entry, ...log].slice(0, ROLL_LOG_LIMIT);
}
