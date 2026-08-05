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

import { MODULE_ID, TABS } from "./constants.mjs";
import { registerSettings } from "./settings.mjs";
import { shouldUseMobileClient } from "./detect.mjs";
import { boot, restoreCanvas } from "./boot.mjs";
import { renderFatalError } from "./fallback.mjs";
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

  // The tab bodies are pulled in by content.hbs as dynamic partials, chosen at
  // render time from the active tab. Handlebars can only resolve a partial that
  // has already been registered, and `loadTemplates` is what registers one
  // under its path — so this has to happen before the first render, not on
  // demand when a tab is opened.
  foundry.applications.handlebars.loadTemplates(
    TABS.map(tab => `modules/${MODULE_ID}/templates/tabs/${tab.id}.hbs`)
  );
});

/* -------------------------------------------- */

/**
 * "setup" is the one hook where the boot path fits: core's settings now exist,
 * and neither the UI nor the canvas has been built yet.
 */
Hooks.once("setup", () => {
  active = shouldUseMobileClient();

  // Not activating is not the same as doing nothing. A client that ran Phonedry
  // on a previous load has a persisted no-canvas setting that must be handed
  // back, or turning Phonedry off leaves the tabletop permanently mapless.
  if ( !active ) {
    restoreCanvas();
    return;
  }

  boot();
});

/* -------------------------------------------- */

/**
 * "ready" is the earliest point at which `game.user.character` is populated, so
 * it is the earliest point worth rendering a character sheet.
 */
Hooks.once("ready", async () => {
  if ( !active ) return;

  // Rendering is awaited inside a try/catch rather than left to float. An
  // ApplicationV2 render failure surfaces as a rejected promise, and an
  // unhandled rejection here is invisible: the tabletop is already gone, so the
  // player sees an empty page and nothing explains why.
  try {
    shell = new PhonedryShell();
    await shell.render({ force: true });
  } catch ( error ) {
    shell = null;
    renderFatalError(error);
    return;
  }

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
