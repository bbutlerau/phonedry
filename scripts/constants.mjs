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
 * The sheet's sections, in the order they appear in the tab bar.
 *
 * Only sections that are actually built belong here. The bar is generated from
 * this list, so adding an entry before its screen exists would put a tab on
 * screen that does nothing — and a control that does nothing is worse on a
 * phone than a missing one, because there is no tooltip to explain it.
 *
 * Navigation is a visible bar rather than an edge swipe on purpose. iOS Safari
 * uses a swipe from the left edge for back and the right edge for forward, and
 * Android's system back gesture claims both edges too; a web page cannot
 * reliably prevent either. An edge-swipe drawer would compete with them, and
 * the failure is losing the page — a full Foundry reload, mid-combat.
 */
export const TABS = [
  { id: "stats", label: "PHONEDRY.Tabs.Stats", icon: "fa-shield-halved" },

  // Between stats and spells because that is how often each is reached for in a
  // fight: attacks and features every round, spells when there is one to cast.
  { id: "actions", label: "PHONEDRY.Tabs.Actions", icon: "fa-hand-fist" },

  { id: "spells", label: "PHONEDRY.Tabs.Spells", icon: "fa-book-sparkles" },

  // After the two screens a fight uses every round, because a pack is opened
  // between fights more often than during one — but before status, because
  // drawing a different weapon is something done mid-combat and the actions
  // screen has no way to do it.
  { id: "items", label: "PHONEDRY.Tabs.Items", icon: "fa-backpack" },

  // Last, because it is the one consulted rather than acted from. Conditions
  // are set once when something happens and then read for the rest of a fight.
  { id: "conditions", label: "PHONEDRY.Tabs.Conditions", icon: "fa-heart-pulse" }
];

/** The section shown on first load. */
export const DEFAULT_TAB = "stats";

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
