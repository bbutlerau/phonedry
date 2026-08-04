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
  MODE: "mode"
};

/**
 * Viewport width (CSS pixels) at or above which the tablet layout applies.
 * 768 is the conventional tablet breakpoint and matches an iPad in portrait.
 */
export const TABLET_BREAKPOINT = 768;
