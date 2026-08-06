/**
 * Casting and preparing spells.
 *
 * Same division as everywhere else: dnd5e owns what happens, we own the button.
 *
 * Casting in particular is not something to reimplement. `Item5e#use` runs the
 * activity, which consumes the right slot at the right level, spends limited
 * uses, applies consumption of materials, rolls attack or damage through the
 * usual pipeline, and posts a chat card other modules can act on. The parts of
 * that we would get wrong are the parts nobody notices until a session.
 */

import { attempt } from "./attempt.mjs";
import { modeFlags, ROLL_MODE } from "./rolls.mjs";

/**
 * Cast a spell.
 *
 * dnd5e may put a usage dialog in front of this — choosing a slot level, or
 * confirming consumption. That dialog is the system's, and on WebKit it is the
 * component this module has had the most trouble with, so it is worth checking
 * on a device whenever this path changes.
 *
 * An attack cantrip gets the same treatment `useActivity` gives a weapon: see
 * the note above it in `actions.mjs` for why `Activity#use` cannot be left to
 * trigger the attack roll on its own. `Item5e#use` is a thin wrapper here —
 * it resolves which activity a multi-activity spell means and forwards this
 * function's own config straight into that activity's `use`, so the same
 * `subsequentActions: false` reaches it the way it would a bare activity call.
 *
 * @param {Item} spell
 * @param {object[]} [targets]
 * @param {string} [mode]  A `ROLL_MODE` value, read only for an attack cantrip.
 * @returns {Promise<object|null>}
 */
export function castSpell(spell, targets = [], mode = ROLL_MODE.NORMAL) {
  /*
   * Targets are handed to dnd5e as message flags because that is exactly where
   * it would have put them itself. Its own `getTargetDescriptors` reads
   * `game.user.targets`, a set of canvas tokens — which on a canvas-free client
   * is permanently empty, so every card this module produced listed no targets.
   * Supplying the same shape it builds gets the card back to parity: targets
   * named, armour classes shown, per-target save buttons working.
   *
   * `use` merges what is passed over its own defaults, so an empty list leaves
   * dnd5e's behaviour untouched rather than overwriting it with nothing.
   */
  const message = targets.length
    ? { data: { flags: { dnd5e: { targets } } } }
    : {};

  // The same heuristic `needsTargets` is checked against for this spell: the
  // first activity stands in for "what casting this spell means", because
  // dnd5e has not resolved which one runs yet — `use` does that internally.
  const activity = spell.system?.activities?.contents?.[0];

  if ( activity?.type === "attack" ) {
    return attempt(async () => {
      await spell.use({ subsequentActions: false }, {}, message);
      return activity.rollAttack({ ...modeFlags(mode) }, { configure: false }, message);
    }, spell.name, "PHONEDRY.Spells.Failed");
  }

  return attempt(() => spell.use({}, {}, message), spell.name, "PHONEDRY.Spells.Failed");
}

/**
 * Prepare or unprepare a spell.
 *
 * Only meaningful for slot-cast spells belonging to a preparing caster; the
 * sheet decides which those are, and does not offer the control otherwise.
 *
 * @param {Item} spell
 * @param {boolean} prepared
 * @returns {Promise<Item|null>}
 */
export function setPrepared(spell, prepared) {
  return attempt(
    () => spell.update({ "system.prepared": prepared ? 1 : 0 }),
    game.i18n.localize("PHONEDRY.Spells.Preparation"),
    "PHONEDRY.Spells.Failed"
  );
}
