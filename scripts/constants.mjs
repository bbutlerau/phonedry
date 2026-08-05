/**
 * Shared constants. Kept in their own file so that every other module can
 * import the module ID without pulling in behaviour along with it.
 */

/** Must match the "id" field in module.json — Foundry keys settings off it. */
export const MODULE_ID = "phonedry";

/**
 * Setting keys, collected here so a typo becomes an import error rather than a
 * silently-undefined setting at runtime.
 */
export const SETTINGS = {
  /** How the mobile client is chosen: "auto" | "always" | "never". */
  MODE: "mode",

  /**
   * Whether Phonedry — rather than the player — turned off `core.noCanvas`.
   *
   * `core.noCanvas` persists in client storage, so disabling it is not confined
   * to the page load that did it. Without recording ownership we could never
   * safely turn it back on, and could never tell our own change apart from a
   * player who deliberately runs canvas-free on a laptop.
   */
  CANVAS_DISABLED_BY_US: "canvasDisabledByUs"
};

/**
 * Viewport width (CSS pixels) at or above which the tablet layout applies.
 * 768 is the conventional tablet breakpoint and matches an iPad in portrait.
 */
export const TABLET_BREAKPOINT = 768;

/**
 * Viewport height (CSS pixels) also required for the tablet layout.
 *
 * Width alone is not enough to tell a tablet from a phone: an iPhone on its
 * side is 852px wide, past the width breakpoint, on a screen with nothing like
 * the room a tablet has. Both dimensions have to be checked, and this value
 * must stay in step with the media query in phonedry.css.
 */
export const TABLET_MIN_HEIGHT = 600;
