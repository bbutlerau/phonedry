/**
 * Phonedry — a canvas-free character sheet client for Foundry VTT on mobile.
 *
 * This file is the module's only entry point. It stays deliberately thin: its
 * job is to wire Foundry's hooks to the modules that do the actual work, so
 * the order of operations during startup is readable in one place.
 *
 * Startup order matters more here than in a typical module, because the whole
 * design depends on suppressing the canvas *before* Foundry initialises it.
 * See scripts/boot.mjs for why that timing is delicate.
 */

import { MODULE_ID } from "./constants.mjs";
import { registerSettings } from "./settings.mjs";
import { shouldUseMobileClient } from "./detect.mjs";

/**
 * `init` fires after core data is loaded but before the canvas is drawn, which
 * makes it the last safe point to opt out of canvas rendering.
 */
Hooks.once("init", () => {
  registerSettings();

  const mobile = shouldUseMobileClient();
  console.log(`${MODULE_ID} | init — mobile client ${mobile ? "enabled" : "not enabled"}`);
});

/**
 * `ready` fires once the world is fully loaded and `game.user` is populated.
 * Sheet rendering belongs here, not in `init`, because it needs to know which
 * actor the connected user owns.
 */
Hooks.once("ready", () => {
  console.log(`${MODULE_ID} | ready — Foundry ${game.version}, system ${game.system.id} ${game.system.version}`);
});
