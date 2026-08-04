/**
 * Boot path — everything that has to happen before Foundry builds the tabletop.
 *
 * The timing here is the load-bearing part of the whole module, so it is worth
 * being explicit about Foundry's startup order (verified against v13.351):
 *
 *   1. Hooks "init"          — modules register their own settings
 *   2. Game#registerSettings — core registers ITS settings, including noCanvas
 *   3. Hooks "setup"
 *   4. Game#initializeUI     — constructs and renders nav, sidebar, hotbar, ...
 *   5. Game#initializeCanvas — Canvas#initialize reads core.noCanvas
 *   6. Hooks "ready"
 *
 * Two consequences follow, and both are easy to get wrong:
 *
 * - We cannot touch `core.noCanvas` during "init", because core has not
 *   registered it yet and `game.settings.get` throws on unregistered keys.
 *   "setup" is the first hook where it exists, and it is still comfortably
 *   before the canvas reads it at step 5.
 * - Suppressing the core UI also has to happen at "setup", because step 4
 *   constructs those applications from `CONFIG.ui`. Once they are built and
 *   rendered, hiding them only hides DOM we already paid to create.
 */

import { MODULE_ID } from "./constants.mjs";

/**
 * The singleton UI applications Phonedry replaces.
 *
 * This list mirrors what `Game#initializeUI` force-renders. Deliberately absent
 * is `notifications`: warnings and errors must still reach the player, and it
 * is the one piece of core UI that costs almost nothing.
 */
const SUPPRESSED_UI = ["nav", "controls", "hotbar", "players", "pause", "sidebar", "webrtc"];

/**
 * Turn off canvas rendering for this client.
 *
 * `Canvas#initialize` returns immediately when this setting is true, so PIXI is
 * never constructed, WebGL is never requested, and no scene texture is ever
 * fetched. That is the entire memory argument for this module in one setting.
 *
 * The write is not awaited on purpose. `ClientSettings#set` handles
 * client-scoped settings synchronously and only returns a promise for symmetry
 * with world-scoped ones, so by the time this function returns the value is
 * already in place — which matters, because hooks cannot await us.
 *
 * @returns {boolean} True if we changed the setting, false if it was already on.
 */
export function disableCanvas() {
  if ( game.settings.get("core", "noCanvas") ) return false;
  game.settings.set("core", "noCanvas", true);
  return true;
}

/**
 * Stop the core tabletop UI from being constructed.
 *
 * Rather than hiding these applications with CSS after the fact, we swap their
 * classes in `CONFIG.ui` for subclasses that decline to render. `initializeUI`
 * still instantiates them, so anything in core or another module that reaches
 * for `ui.sidebar` or calls `ui.combat.render()` finds a real object and does
 * not throw — it simply gets a no-op. Nothing builds DOM that a player on a
 * phone will never see.
 *
 * `render` returns `this` rather than a promise. Application V1 returns the
 * instance synchronously while ApplicationV2 returns a promise, and awaiting a
 * non-promise resolves to the value itself, so this shape is safe for callers
 * of either generation.
 */
export function suppressCoreUI() {
  for ( const key of SUPPRESSED_UI ) {
    const cls = CONFIG.ui[key];
    if ( !cls ) continue;
    CONFIG.ui[key] = class PhonedrySuppressedApplication extends cls {
      render() {
        return this;
      }
    };
  }
}

/**
 * Allow CSS `env(safe-area-inset-*)` to report real values.
 *
 * Foundry ships a viewport meta of
 * `width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no`
 * with no `viewport-fit`. The default is `viewport-fit=contain`, under which
 * the safe-area insets always resolve to zero — so a sheet would happily place
 * a tap target under the notch or the home indicator and we would never know
 * from testing on a desktop browser.
 *
 * We append rather than replace, keeping Foundry's own zoom-locking intact.
 */
export function enableSafeAreaInsets() {
  const meta = document.querySelector('meta[name="viewport"]');
  if ( !meta || meta.content.includes("viewport-fit") ) return;
  meta.content = `${meta.content}, viewport-fit=cover`;
}

/**
 * Mark the document so Phonedry's stylesheet applies.
 *
 * Every rule in phonedry.css is scoped under `.phonedry-active`, so without
 * this class the module is inert no matter what else it has registered.
 */
export function activateBodyClass() {
  document.body.classList.add("phonedry-active");
}

/**
 * Run the full boot sequence. Called once, from the "setup" hook.
 */
export function boot() {
  const changed = disableCanvas();
  suppressCoreUI();
  enableSafeAreaInsets();
  activateBodyClass();

  console.log(
    `${MODULE_ID} | boot — canvas disabled (${changed ? "by Phonedry" : "already off"}), core UI suppressed`
  );
}
