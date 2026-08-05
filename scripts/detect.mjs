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

import { TABLET_BREAKPOINT, TABLET_MIN_HEIGHT } from "./constants.mjs";
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
 * Is the viewport big enough for the tablet layout?
 *
 * This drives layout only — it never decides whether the mobile client loads.
 * A phone and a tablet both get Phonedry; the tablet just gets more on screen.
 *
 * Both dimensions are checked. Width alone calls an iPhone in landscape a
 * tablet — it is 852px wide on its side — and hands it a layout meant for a
 * screen four times the height.
 *
 * @returns {boolean}
 */
export function isTabletViewport() {
  return (window.innerWidth >= TABLET_BREAKPOINT)
    && (window.innerHeight >= TABLET_MIN_HEIGHT);
}

/**
 * Read the `?phonedry=` URL override, if present.
 *
 * This is the escape hatch, and it exists because of how badly Phonedry can
 * strand someone. Once the boot path runs, the sidebar is gone — and with it
 * every route to the settings menu. If the sheet then fails to render, a player
 * is left on a blank screen with no way to turn the module off and no way back
 * to the tabletop, on a device where clearing site data is the only remaining
 * option.
 *
 * Appending `?phonedry=off` to the URL sidesteps the module entirely for that
 * page load, which is something a player can do from a phone unaided.
 *
 * @returns {boolean|null} True or false to force a decision, null if unset.
 */
export function getUrlOverride() {
  const value = new URLSearchParams(window.location.search).get("phonedry");
  if ( ["off", "0", "false"].includes(value) ) return false;
  if ( ["on", "1", "true"].includes(value) ) return true;
  return null;
}

/**
 * Should this client load the Phonedry sheet instead of the tabletop?
 *
 * Precedence is URL override, then the user's setting, then detection.
 * Detection is a convenience so that players don't have to configure anything;
 * it is not an authority, and being wrong about someone's device should never
 * leave them stuck.
 *
 * @returns {boolean}
 */
export function shouldUseMobileClient() {
  const override = getUrlOverride();
  if ( override !== null ) return override;

  switch (getMode()) {
    case MODE.ALWAYS:
      return true;
    case MODE.NEVER:
      return false;
    default:
      return isTouchDevice();
  }
}
