/**
 * The last line of defence.
 *
 * Phonedry disables the canvas and suppresses the tabletop UI before it renders
 * anything of its own. If that render then fails, the player is left with a
 * blank screen — no sheet, no sidebar, and on a phone no practical way to open
 * a console and find out why. That is precisely how the first iPhone 15 test
 * failed, and it cost a round trip to diagnose something the device already
 * knew.
 *
 * So when rendering fails, we paint the error onto the page ourselves.
 *
 * Everything here is deliberately primitive: direct DOM construction, inline
 * styles, no Handlebars, no ApplicationV2, no stylesheet dependency. This code
 * runs precisely when the sophisticated path has already failed, so it must not
 * share any machinery with it.
 */

import { MODULE_ID } from "./constants.mjs";

/**
 * Display a fatal error, with a way out.
 *
 * @param {Error} error The error that prevented the sheet from rendering.
 */
export function renderFatalError(error) {
  console.error(`${MODULE_ID} | fatal error while rendering`, error);

  // Rebuild the current URL with the escape hatch applied, so the way back is a
  // tap rather than something the player has to type accurately on a phone.
  const escapeUrl = new URL(window.location.href);
  escapeUrl.searchParams.set("phonedry", "off");

  const panel = document.createElement("div");
  panel.id = "phonedry-fatal";
  panel.setAttribute("style", [
    "position: fixed",
    "inset: 0",
    "z-index: 100000",
    "overflow-y: auto",
    "padding: max(env(safe-area-inset-top, 0px), 1rem) 1rem max(env(safe-area-inset-bottom, 0px), 1rem)",
    "background: #16161a",
    "color: #e8e6e3",
    "font: 14px/1.5 system-ui, sans-serif"
  ].join(";"));

  const heading = document.createElement("h1");
  heading.textContent = "Phonedry failed to start";
  heading.setAttribute("style", "margin: 0 0 0.5rem; font-size: 1.25rem; color: #d9534f");

  const explanation = document.createElement("p");
  explanation.textContent =
    "The character sheet could not be displayed. The tabletop was already "
    + "disabled at this point, which is why the screen is otherwise empty.";
  explanation.setAttribute("style", "margin: 0 0 1rem");

  const link = document.createElement("a");
  link.href = escapeUrl.toString();
  link.textContent = "Reload without Phonedry";
  link.setAttribute("style", [
    "display: inline-block",
    "margin-bottom: 1rem",
    "padding: 0.75rem 1rem",
    // Comfortably above the 44px minimum touch target, since this is the one
    // control someone in this state actually needs to hit.
    "min-height: 44px",
    "box-sizing: border-box",
    "background: #c9a227",
    "color: #16161a",
    "font-weight: bold",
    "text-decoration: none",
    "border-radius: 0.5rem"
  ].join(";"));

  const detail = document.createElement("pre");
  detail.textContent = `${error?.message ?? error}\n\n${error?.stack ?? ""}`.trim();
  detail.setAttribute("style", [
    "margin: 0",
    "padding: 0.75rem",
    "background: #23232b",
    "border-radius: 0.5rem",
    "white-space: pre-wrap",
    "word-break: break-word",
    "font-size: 12px"
  ].join(";"));

  panel.append(heading, explanation, link, detail);
  document.body.append(panel);
}
