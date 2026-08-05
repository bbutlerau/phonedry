/**
 * Hit point changes.
 *
 * Same rule as rolls: dnd5e owns the arithmetic, we own the interface. That is
 * not pedantry here — applying damage is more involved than subtracting a
 * number. Temporary hit points absorb damage first and are spent before real
 * ones; a temporary maximum shifts the ceiling; healing stops at the maximum
 * and damage stops at zero rather than running negative; and each of those has
 * a hook that other modules listen to.
 *
 * `Actor5e#applyDamage` does all of it. Given a plain number it also sets
 * `ignore: true` internally, so resistances and immunities are deliberately
 * *not* applied — which is the correct behaviour for a number a player has
 * typed in, because whoever told them "take 12" already did that arithmetic.
 */

/**
 * Run an update, reporting failures to the player rather than the console.
 *
 * There is no F12 on a phone, so a silent exception here would look like a
 * button that simply does nothing.
 *
 * @param {Function} fn
 * @param {string} describe
 * @returns {Promise<Actor|null>}
 */
async function attempt(fn, describe) {
  try {
    return await fn();
  } catch ( error ) {
    console.error("phonedry | hit point update failed", error);
    ui.notifications?.error(game.i18n.format("PHONEDRY.HitPoints.Failed", { what: describe }));
    return null;
  }
}

/**
 * Read an amount typed into the hit point editor.
 *
 * Returns null for anything that is not a positive whole number. Direction is
 * chosen by which button was pressed, not by a minus sign, so a negative here
 * is a typo rather than an instruction — accepting it would mean "damage -5"
 * quietly healed someone.
 *
 * @param {string} raw
 * @returns {number|null}
 */
export function parseAmount(raw) {
  const value = Number.parseInt(raw, 10);
  if ( !Number.isFinite(value) || (value <= 0) ) return null;
  return value;
}

/**
 * Apply damage. Positive numbers reduce hit points.
 *
 * @param {Actor} actor
 * @param {number} amount
 * @returns {Promise<Actor|null>}
 */
export function applyDamage(actor, amount) {
  return attempt(() => actor.applyDamage(amount), "the damage");
}

/**
 * Apply healing. dnd5e treats healing as negative damage, which is also what
 * makes it stop at the character's maximum without us checking.
 *
 * @param {Actor} actor
 * @param {number} amount
 * @returns {Promise<Actor|null>}
 */
export function applyHealing(actor, amount) {
  return attempt(() => actor.applyDamage(-amount), "the healing");
}

/**
 * Grant temporary hit points.
 *
 * These do not stack in 5e: a new pool replaces the old one only if it is
 * larger. `applyTempHP` enforces that, so a player who taps this with a smaller
 * number correctly keeps what they had.
 *
 * @param {Actor} actor
 * @param {number} amount
 * @returns {Promise<Actor|null>}
 */
export function applyTempHP(actor, amount) {
  return attempt(() => actor.applyTempHP(amount), "the temporary hit points");
}
