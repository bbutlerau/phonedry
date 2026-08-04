/**
 * Device detection.
 *
 * The question this file answers is narrower than "is this a mobile device?".
 * It is: "should this client skip the tabletop and load the sheet instead?"
 *
 * We answer it from input capability rather than user-agent strings. User
 * agents lie — iPads have reported themselves as desktop Safari since iPadOS
 * 13, and sniffing model names is a losing game. Input capability is both more
 * honest and more relevant: a device driven by a finger needs the touch UI, and
 * a device driven by a finger is also the kind of device with a memory ceiling.
 */

import { TABLET_BREAKPOINT } from "./constants.mjs";
import { getMode, MODE } from "./settings.mjs";

/**
 * Does this device look like a phone or tablet?
 *
 * Two signals, both required:
 *
 *   - `pointer: coarse` — the primary pointing device is imprecise, i.e. a
 *     finger rather than a mouse or trackpad.
 *   - `hover: none` — the primary pointer cannot hover.
 *
 * Requiring both matters. A touchscreen laptop reports a coarse pointer when
 * someone prods the screen, but it still has a trackpad, so it reports that it
 * can hover. Demanding both signals keeps those machines on the full client,
 * which is what their owners expect.
 *
 * @returns {boolean}
 */
export function isTouchDevice() {
  return window.matchMedia("(pointer: coarse)").matches
    && window.matchMedia("(hover: none)").matches;
}

/**
 * Is the viewport wide enough for the tablet layout?
 *
 * This drives layout only — it never decides whether the mobile client loads.
 * A phone and a tablet both get Phonedry; the tablet just gets more on screen.
 *
 * @returns {boolean}
 */
export function isTabletViewport() {
  return window.innerWidth >= TABLET_BREAKPOINT;
}

/**
 * Should this client load the Phonedry sheet instead of the tabletop?
 *
 * The user's setting always wins over detection. Detection is a convenience so
 * that players don't have to configure anything; it is not an authority, and
 * being wrong about someone's device should never leave them stuck.
 *
 * @returns {boolean}
 */
export function shouldUseMobileClient() {
  switch (getMode()) {
    case MODE.ALWAYS:
      return true;
    case MODE.NEVER:
      return false;
    default:
      return isTouchDevice();
  }
}
