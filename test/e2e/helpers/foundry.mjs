/**
 * Helpers for driving a live Foundry instance from Playwright.
 */

/**
 * The Foundry user the tests join as. Override with PHONEDRY_TEST_USER.
 *
 * A player rather than the GM, and with a character assigned: the sheet is the
 * thing under test, and a GM with no assigned character exercises only the
 * empty state. This is also the more honest simulation — Phonedry is aimed at
 * players, and a player's permissions are the narrower set.
 */
export const TEST_USER = process.env.PHONEDRY_TEST_USER ?? "phonedrt";

/** An iPhone 15 viewport, in CSS pixels. */
export const PHONE_VIEWPORT = { width: 393, height: 852 };

/** An iPad viewport in portrait, comfortably past the tablet breakpoint. */
export const TABLET_VIEWPORT = { width: 820, height: 1180 };

/**
 * The same iPhone 15 on its side.
 *
 * Wider than the 768px tablet breakpoint, which is the trap: on width alone
 * this reads as a tablet.
 */
export const LANDSCAPE_PHONE_VIEWPORT = { width: 852, height: 393 };

/**
 * Join the world and wait until the game is ready.
 *
 * The join happens at a desktop-sized viewport even when the test is about
 * mobile, and that is not incidental. Foundry raises a permanent "window too
 * small" error on any viewport under 1024×768, and on the join page Phonedry is
 * not loaded yet to filter it — the notification then sits over the join button
 * and swallows the click. Joining large and resizing afterwards sidesteps a
 * problem that has nothing to do with what we are testing.
 *
 * @param {import("@playwright/test").Page} page
 */
export async function joinGame(page) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/join", { waitUntil: "networkidle" });
  await page.selectOption("select[name='userid']", { label: TEST_USER });
  await page.locator("#join-game-form button[name='join']").click();
  await waitForGameReady(page);
}

/**
 * Reload at a given viewport and wait for the game to be ready again.
 *
 * Phonedry decides whether to activate during the `setup` hook, so the viewport
 * has to be in place before the page loads — resizing an already-loaded game
 * changes nothing. Every test that cares about activation must go through here.
 *
 * @param {import("@playwright/test").Page} page
 * @param {{width: number, height: number}} viewport
 * @param {string} [query] Query string to append, e.g. "?phonedry=off".
 */
export async function reloadAt(page, viewport, query = "") {
  await page.setViewportSize(viewport);
  await page.goto(`/game${query}`, { waitUntil: "networkidle" });
  await waitForGameReady(page);

  // The shell renders on the `ready` hook, which resolves a tick after
  // `game.ready` flips. Waiting on the flag alone races the first render.
  await page.waitForTimeout(1500);
}

/**
 * @param {import("@playwright/test").Page} page
 */
export async function waitForGameReady(page) {
  await page.waitForFunction(() => globalThis.game?.ready === true, null, { timeout: 90_000 });
}

/**
 * Collect the state the smoke tests assert against.
 *
 * Gathered in a single `evaluate` so every value describes the same moment;
 * separate round trips could straddle a re-render and disagree.
 *
 * @param {import("@playwright/test").Page} page
 */
export async function readState(page) {
  return page.evaluate(() => ({
    noCanvas: game.settings.get("core", "noCanvas"),
    canvasReady: !!globalThis.canvas?.ready,

    // The load-bearing assertion. `noCanvas` being true only says the setting
    // was applied; this says no PIXI application was ever constructed, which is
    // the memory saving the whole module exists for.
    pixiApplication: !!globalThis.canvas?.app,

    phonedryActive: document.body.classList.contains("phonedry-active"),
    shellPresent: !!document.getElementById("phonedry-shell"),
    fatalPresent: !!document.getElementById("phonedry-fatal"),
    fatalText: document.getElementById("phonedry-fatal")?.innerText ?? null,
    notifications: [...document.querySelectorAll("#notifications li")].map(n => n.innerText),

    // Foundry ships these as empty elements in its static HTML, so presence
    // proves nothing — content does. If suppression fails, these gain children.
    renderedCoreUI: ["#sidebar", "#hotbar", "#scene-controls", "#players", "#navigation"]
      .filter(sel => (document.querySelector(sel)?.childElementCount ?? 0) > 0)
  }));
}

/**
 * Attach console and page-error collection to a page.
 *
 * @param {import("@playwright/test").Page} page
 * @returns {string[]} A live array that fills as the page runs.
 */
export function collectErrors(page) {
  const errors = [];
  page.on("pageerror", e => errors.push(`pageerror: ${e.message}`));
  page.on("console", m => {
    if ( m.type() !== "error" ) return;

    /*
     * A missing asset is the world's problem, not the module's.
     *
     * Actors routinely point at artwork that is not there — a module
     * uninstalled, a world copied without its user files — and every screen
     * showing a portrait would then fail a test about something else entirely.
     * The module's answer to a missing image is the silhouette fallback, which
     * is asserted where it belongs rather than by counting console noise here.
     */
    if ( m.text().startsWith("Failed to load resource") ) return;

    errors.push(`console: ${m.text()}`);
  });
  return errors;
}

/**
 * Press and hold an element.
 *
 * Playwright has no long-press primitive, so this drives the pointer directly.
 * The element is scrolled into view first: raw mouse events do not scroll the
 * way `click()` does, and pressing at coordinates below the fold silently
 * reaches nothing at all.
 *
 * The finger does not move between down and up, because the gesture layer
 * cancels a hold that drifts — which is what stops a panel appearing mid-scroll.
 *
 * @param {import("@playwright/test").Page} page
 * @param {import("@playwright/test").Locator} locator
 */
export async function longPress(page, locator) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();

  await page.mouse.move(box.x + (box.width / 2), box.y + (box.height / 2));
  await page.mouse.down();
  await page.waitForTimeout(800);
  await page.mouse.up();
}
