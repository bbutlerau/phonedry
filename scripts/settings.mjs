/**
 * Client settings for Phonedry.
 *
 * Every setting here is client-scoped. Whether to use the mobile client is a
 * property of the device sitting in someone's hands, not of the world, so a GM
 * must not be able to force it on everyone from world settings.
 */

import { MODULE_ID, SETTINGS } from "./constants.mjs";

/** Valid values for the MODE setting. */
export const MODE = {
  AUTO: "auto",
  ALWAYS: "always",
  NEVER: "never"
};

/**
 * Register settings. Called from the `init` hook — settings must exist before
 * anything reads them, and `init` is the earliest hook where registration is
 * permitted.
 */
export function registerSettings() {
  game.settings.register(MODULE_ID, SETTINGS.MODE, {
    name: "PHONEDRY.Settings.Mode.Name",
    hint: "PHONEDRY.Settings.Mode.Hint",
    scope: "client",
    config: true,
    type: String,
    choices: {
      [MODE.AUTO]: "PHONEDRY.Settings.Mode.Auto",
      [MODE.ALWAYS]: "PHONEDRY.Settings.Mode.Always",
      [MODE.NEVER]: "PHONEDRY.Settings.Mode.Never"
    },
    default: MODE.AUTO,
    // Changing this changes whether the canvas initialises, and that decision
    // is made once during startup. A reload is the only honest way to apply it.
    requiresReload: true
  });
}

/**
 * Read the current mode.
 *
 * @returns {string} One of the MODE values.
 */
export function getMode() {
  return game.settings.get(MODULE_ID, SETTINGS.MODE);
}
