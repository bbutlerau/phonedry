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

import { MODULE_ID, SETTINGS } from "./constants.mjs";

/**
 * The singleton UI applications Phonedry replaces.
 *
 * This list mirrors what `Game#initializeUI` force-renders. Deliberately absent
 * is `notifications`: warnings and errors must still reach the player, and it
 * is the one piece of core UI that costs almost nothing.
 */
const SUPPRESSED_UI = ["nav", "controls", "hotbar", "players", "pause", "sidebar", "webrtc"];

/**
 * Notification keys Phonedry drops.
 *
 * Both of these are guaranteed to fire for every Phonedry user, every session,
 * and neither describes a problem the player can act on.
 *
 * `ERROR.RESOLUTION.*` — `ClientIssues#validateResolution` raises a *permanent*
 * error whenever the viewport is under 1024×768, advising the player to enlarge
 * the window or reduce browser zoom. On a phone that is impossible to follow.
 * Worse than noise: it never auto-dismisses, it covers the sheet, and it
 * swallows taps that land on it. Foundry re-runs the check on resize, so
 * dismissing it once is not enough — it has to be filtered at the source.
 *
 * `INFO.SceneViewCanvasDisabled` — announces that the scene is not being drawn
 * because the canvas is off. For this module that is not news, it is the entire
 * design, and it reappears on every scene change.
 *
 * Deliberately narrow. Every other notification, including real errors, still
 * reaches the player.
 */
const SUPPRESSED_NOTIFICATIONS = /^(ERROR\.RESOLUTION\.|INFO\.SceneViewCanvasDisabled)/;

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

  // Record that the change was ours, so it can be undone. A player who already
  // had no-canvas mode on gets no flag and is left alone.
  game.settings.set(MODULE_ID, SETTINGS.CANVAS_DISABLED_BY_US, true);
  return true;
}

/* -------------------------------------------- */

/**
 * Give the canvas back when Phonedry is not driving.
 *
 * `core.noCanvas` persists in client storage, so a client that ran Phonedry
 * once stays canvas-free afterwards unless something puts it back. That turns
 * the `?phonedry=off` escape hatch into a trap: the player escapes a broken
 * sheet and lands on a tabletop with no map, which looks like a worse failure
 * than the one they were escaping.
 *
 * Called from "setup" on any load where Phonedry is inactive, which is early
 * enough for the canvas to initialise normally in the same page load — no
 * second reload required.
 *
 * Only reverses Phonedry's own change. If the player turned no-canvas mode on
 * themselves, the flag was never set and their preference stands.
 *
 * @returns {boolean} True if the canvas was restored.
 */
export function restoreCanvas() {
  if ( !game.settings.get(MODULE_ID, SETTINGS.CANVAS_DISABLED_BY_US) ) return false;

  game.settings.set("core", "noCanvas", false);
  game.settings.set(MODULE_ID, SETTINGS.CANVAS_DISABLED_BY_US, false);
  console.log(`${MODULE_ID} | inactive — canvas restored`);
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
 * Filter out the unfixable "window too small" error.
 *
 * `Notifications#error` delegates to `#notify`, so overriding the one method
 * covers every severity. Returning null rather than a notification is safe:
 * core guards its stored handle with a truthiness check before calling
 * `remove`, so a dropped notification simply never gets removed.
 */
export function filterResolutionWarnings() {
  const cls = CONFIG.ui.notifications;
  if ( !cls ) return;

  CONFIG.ui.notifications = class PhonedryNotifications extends cls {
    notify(message, type = "info", options = {}) {
      if ( (typeof message === "string") && SUPPRESSED_NOTIFICATIONS.test(message) ) return null;
      return super.notify(message, type, options);
    }
  };
}

/* -------------------------------------------- */

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
 * Ask Foundry to carry spell levels and schools in its compendium indexes.
 *
 * The spell browser needs both to sort by anything other than name, and neither
 * is in the index Foundry builds by default. Requesting them afterwards, with
 * `getIndex({ fields })`, forces a rebuild that was measured at about ten
 * seconds in the development world — long enough that the browser would look
 * like it had hung.
 *
 * Declaring them here instead costs nothing extra: the index is built once,
 * lazily, and simply carries two more scalar fields when it is. This is the
 * same mechanism dnd5e uses for its own `system.identifier`.
 *
 * Timing matters. It has to happen before anything indexes a pack, which
 * includes dnd5e's spell list registry at "ready" — "setup" is comfortably
 * early. Done only when Phonedry is active, so a desktop player pays nothing.
 */
export function registerIndexFields() {
  const fields = CONFIG.Item?.compendiumIndexFields;
  if ( !fields ) return;

  for ( const field of ["system.level", "system.school", "system.rarity"] ) {
    if ( !fields.includes(field) ) fields.push(field);
  }
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
  registerIndexFields();
  suppressCoreUI();
  filterResolutionWarnings();
  enableSafeAreaInsets();
  activateBodyClass();

  console.log(
    `${MODULE_ID} | boot — canvas disabled (${changed ? "by Phonedry" : "already off"}), core UI suppressed`
  );
}
