/**
 * Roll delegation.
 *
 * Every function here is a thin wrapper around dnd5e's own API. Phonedry never
 * builds a formula, never applies a proficiency bonus, never decides what a
 * critical is. That is not modesty about scope — it is what keeps chat cards,
 * active effects, flags like Reliable Talent, and every third-party roll module
 * working. The moment we assemble a `1d20 + n` ourselves, all of that silently
 * stops applying to rolls made from a phone.
 *
 * The one thing this layer *does* decide is whether dnd5e's roll configuration
 * dialog appears, and that needs explaining.
 *
 * dnd5e chooses between "show the dialog" and "just roll" by reading modifier
 * keys off the triggering event: hold the advantage keybind and it rolls with
 * advantage immediately, hold nothing and you get the dialog. A phone has no
 * modifier keys, so left alone, *every* tap would open a desktop-shaped dialog
 * for a decision the player usually has not got — the overwhelming majority of
 * rolls are straight ones.
 *
 * Phonedry moves that choice into a control the player sets before rolling, so
 * these wrappers pass `configure: false` to suppress the dialog and state the
 * advantage mode explicitly, which is the same pair of values the dialog would
 * have produced.
 */

/**
 * How a roll should be made. Mirrors the three outcomes of dnd5e's dialog.
 * @enum {string}
 */
export const ROLL_MODE = {
  NORMAL: "normal",
  ADVANTAGE: "advantage",
  DISADVANTAGE: "disadvantage"
};

/**
 * Turn a roll mode into the config flags dnd5e expects.
 *
 * @param {string} mode  A ROLL_MODE value.
 * @returns {{advantage: boolean, disadvantage: boolean}}
 */
function modeFlags(mode) {
  return {
    advantage: mode === ROLL_MODE.ADVANTAGE,
    disadvantage: mode === ROLL_MODE.DISADVANTAGE
  };
}

/**
 * Dialog configuration shared by every roll: never show one.
 *
 * Note this suppresses only the *roll configuration* dialog. Anything dnd5e
 * raises as a consequence of the roll — a concentration prompt, a chat card
 * with buttons — is untouched.
 */
const NO_DIALOG = { configure: false };

/* -------------------------------------------- */

/**
 * Run a roll, reporting failures to the player rather than to the console.
 *
 * There is no F12 on a phone. An exception that would merely be untidy on a
 * desktop is invisible here, and the player is left tapping a button that
 * appears to do nothing, so every roll goes through this.
 *
 * @param {Function} fn      The roll to attempt.
 * @param {string} describe  What was being rolled, for the error message.
 * @returns {Promise<object[]|null>}
 */
async function attempt(fn, describe) {
  try {
    return await fn();
  } catch ( error ) {
    console.error("phonedry | roll failed", error);
    ui.notifications?.error(game.i18n.format("PHONEDRY.Rolls.Failed", { what: describe }));
    return null;
  }
}

/* -------------------------------------------- */

/**
 * Roll a raw ability check — the d20 for the ability itself, not for a skill.
 *
 * @param {Actor} actor
 * @param {string} ability  An ability key, e.g. "dex".
 * @param {string} [mode]   A ROLL_MODE value.
 * @returns {Promise<object[]|null>}
 */
export function rollAbilityCheck(actor, ability, mode = ROLL_MODE.NORMAL) {
  return attempt(
    () => actor.rollAbilityCheck({ ability, ...modeFlags(mode) }, NO_DIALOG),
    "the ability check"
  );
}

/**
 * Roll a saving throw.
 *
 * @param {Actor} actor
 * @param {string} ability
 * @param {string} [mode]
 * @returns {Promise<object[]|null>}
 */
export function rollSavingThrow(actor, ability, mode = ROLL_MODE.NORMAL) {
  return attempt(
    () => actor.rollSavingThrow({ ability, ...modeFlags(mode) }, NO_DIALOG),
    "the saving throw"
  );
}

/**
 * Roll a skill check.
 *
 * The ability is deliberately not passed. dnd5e resolves each skill's ability
 * itself, which is what lets a GM or a module swap Intimidation onto Strength
 * without us knowing about it.
 *
 * @param {Actor} actor
 * @param {string} skill  A skill key, e.g. "ath".
 * @param {string} [mode]
 * @returns {Promise<object[]|null>}
 */
export function rollSkill(actor, skill, mode = ROLL_MODE.NORMAL) {
  return attempt(
    () => actor.rollSkill({ skill, ...modeFlags(mode) }, NO_DIALOG),
    "the skill check"
  );
}

/**
 * Roll a death saving throw.
 *
 * dnd5e refuses this above zero hit points and warns the player itself, so
 * there is no guard here — the sheet only offers the control when it applies,
 * and the system is the authority if the two ever disagree.
 *
 * @param {Actor} actor
 * @param {string} [mode]
 * @returns {Promise<object[]|null>}
 */
export function rollDeathSave(actor, mode = ROLL_MODE.NORMAL) {
  return attempt(
    () => actor.rollDeathSave({ ...modeFlags(mode) }, NO_DIALOG),
    "the death save"
  );
}

/**
 * Roll initiative, without dnd5e's configuration dialog.
 *
 * That dialog was kept at first on the belief that `rollInitiativeDialog` was
 * the only entry point which files the result with the combat tracker. It is
 * not: the dialog collects an advantage mode and then calls
 * `rollInitiative({ createCombatants: true })` itself, and that is the method
 * doing the real work. Since the sheet already knows the advantage mode, the
 * dialog was collecting an answer it had been given.
 *
 * Removing it also removes the last piece of desktop UI a player on a phone
 * could reach. It rendered badly on iOS — the whole middle of the window, the
 * formula and the situational bonus field, collapsed to nothing, leaving a
 * title and three buttons — and rather than patch another package's layout
 * blind, initiative now behaves like every other roll on the sheet: one tap.
 *
 * `createCombatants` adds the character to the encounter if they are not
 * already in it. With no active combat, core warns the player and does nothing,
 * which is the right outcome — a player cannot open an encounter.
 *
 * @param {Actor} actor
 * @param {string} [mode]  A ROLL_MODE value.
 * @returns {Promise<Combat|null>}
 */
export function rollInitiative(actor, mode = ROLL_MODE.NORMAL) {
  return attempt(
    () => actor.rollInitiative({ createCombatants: true }, modeFlags(mode)),
    "initiative"
  );
}

/* -------------------------------------------- */

/**
 * Whether a mode is one the player should be reminded about.
 *
 * The advantage selector is sticky — it stays where it was put until it is
 * changed — which is the behaviour a player wants when a spell has granted them
 * advantage for a whole fight. The hazard is the other side of that: a mode
 * left on silently skews every subsequent roll. Anything non-normal therefore
 * gets a loud, permanent indicator rather than a subtle highlight.
 *
 * @param {string} mode  A ROLL_MODE value.
 * @returns {boolean}
 */
export function isModeConspicuous(mode) {
  return mode !== ROLL_MODE.NORMAL;
}
