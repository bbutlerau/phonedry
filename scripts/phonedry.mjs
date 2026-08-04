/**
 * Phonedry — a canvas-free character sheet client for Foundry VTT on mobile.
 *
 * This file is the module's only entry point. It stays deliberately thin: its
 * job is to wire Foundry's hooks to the modules that do the actual work, so the
 * order of operations during startup is readable in one place.
 *
 * Startup order matters more here than in a typical module, because the whole
 * design depends on suppressing the canvas before Foundry initialises it. See
 * scripts/boot.mjs for the full sequence and why each step lands where it does.
 */

import { MODULE_ID } from "./constants.mjs";
import { registerSettings } from "./settings.mjs";
import { shouldUseMobileClient } from "./detect.mjs";
import { boot } from "./boot.mjs";
import { PhonedryShell } from "./sheet/shell.mjs";

/**
 * The active shell, if this client is running the mobile UI.
 * @type {PhonedryShell|null}
 */
let shell = null;

/**
 * Whether this client should run Phonedry. Decided once, at "setup", and reused
 * at "ready" — re-checking later would risk the two hooks disagreeing if a
 * setting changed in between, which would leave the canvas off with no sheet to
 * show for it.
 * @type {boolean}
 */
let active = false;

/* -------------------------------------------- */

/**
 * "init" is only for registering our own settings. It is too early to read
 * core's — core registers its settings immediately *after* this hook — so the
 * decision to disable the canvas cannot be made or acted on here.
 */
Hooks.once("init", () => {
  registerSettings();
});

/* -------------------------------------------- */

/**
 * "setup" is the one hook where the boot path fits: core's settings now exist,
 * and neither the UI nor the canvas has been built yet.
 */
Hooks.once("setup", () => {
  active = shouldUseMobileClient();
  if ( !active ) return;

  boot();
});

/* -------------------------------------------- */

/**
 * "ready" is the earliest point at which `game.user.character` is populated, so
 * it is the earliest point worth rendering a character sheet.
 */
Hooks.once("ready", () => {
  if ( !active ) return;

  shell = new PhonedryShell();
  shell.render({ force: true });

  console.log(
    `${MODULE_ID} | ready — Foundry ${game.version}, ${game.system.id} ${game.system.version}`
  );
});

/* -------------------------------------------- */

/**
 * Exposed for debugging from the browser console, and as the seam other modules
 * would use if Phonedry ever needs an integration point. Nothing internal
 * depends on this object.
 */
Hooks.once("ready", () => {
  game.modules.get(MODULE_ID).api = {
    get active() {
      return active;
    },
    get shell() {
      return shell;
    }
  };
});
