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

/**
 * Cast a spell.
 *
 * dnd5e may put a usage dialog in front of this — choosing a slot level, or
 * confirming consumption. That dialog is the system's, and on WebKit it is the
 * component this module has had the most trouble with, so it is worth checking
 * on a device whenever this path changes.
 *
 * @param {Item} spell
 * @returns {Promise<object|null>}
 */
export function castSpell(spell, targets = []) {
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
