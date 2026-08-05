import { test, expect, devices } from "@playwright/test";
import {
  joinGame, reloadAt, readState, collectErrors,
  PHONE_VIEWPORT, TABLET_VIEWPORT
} from "./helpers/foundry.mjs";

/**
 * Boot path smoke tests.
 *
 * These exist because of how Phonedry fails. It disables the canvas and removes
 * the tabletop UI before rendering anything of its own, so almost any error
 * leaves a blank screen with no visible cause — which is exactly how the first
 * device test failed. Three things therefore need proving on every change:
 * that it activates when it should, that it stays out of the way when it
 * should not, and that there is a way back when it goes wrong.
 */

// Touch flags rather than a full device descriptor. Phonedry detects on input
// capability — pointer: coarse and hover: none — and `isMobile` plus `hasTouch`
// are what make Chromium report those. Viewport size is set per test.
const TOUCH = { ...devices["iPhone 15"], viewport: undefined };

test.describe("phonedry boot path", () => {
  test("activates on a touch device and never constructs a canvas", async ({ browser }) => {
    const context = await browser.newContext(TOUCH);
    const page = await context.newPage();
    const errors = collectErrors(page);

    await joinGame(page);
    await reloadAt(page, PHONE_VIEWPORT);
    const state = await readState(page);

    expect(state.fatalText, "shell threw during render").toBeNull();
    expect(state.phonedryActive).toBe(true);
    expect(state.shellPresent).toBe(true);

    expect(state.noCanvas).toBe(true);
    expect(state.canvasReady).toBe(false);
    expect(state.pixiApplication, "a PIXI application was constructed").toBe(false);

    expect(state.renderedCoreUI, "core UI rendered despite suppression").toEqual([]);

    // Both filtered notifications are guaranteed to fire on a phone-sized
    // viewport, so an empty list is a real assertion rather than a vacuous one.
    expect(state.notifications).toEqual([]);
    expect(errors).toEqual([]);

    await context.close();
  });

  test("uses the tablet layout on a larger touch viewport", async ({ browser }) => {
    const context = await browser.newContext(TOUCH);
    const page = await context.newPage();

    await joinGame(page);
    await reloadAt(page, TABLET_VIEWPORT);
    const state = await readState(page);

    expect(state.shellPresent).toBe(true);
    expect(state.pixiApplication).toBe(false);

    // A tablet is still a phone client with more room, not a different mode:
    // the difference is entirely in how many columns the layout uses. Reading
    // the resolved grid is the only way to prove the media query applied —
    // asserting on the viewport would only restate what the test set up.
    const columns = await page.locator(".phonedry-abilities").evaluate(
      el => getComputedStyle(el).gridTemplateColumns.split(" ").length
    );
    expect(columns, "abilities did not expand to the tablet layout").toBe(6);

    await context.close();
  });

  test("stays out of the way on a desktop browser", async ({ browser }) => {
    // No touch flags: a mouse-driven browser reports pointer: fine and
    // hover: hover, so detection should decline to activate.
    const context = await browser.newContext();
    const page = await context.newPage();

    await joinGame(page);
    await reloadAt(page, { width: 1280, height: 900 });
    const state = await readState(page);

    expect(state.phonedryActive).toBe(false);
    expect(state.shellPresent).toBe(false);

    // The canvas must be untouched. Disabling it for a desktop player would be
    // a far worse failure than not activating on a phone.
    expect(state.noCanvas).toBe(false);
    expect(state.renderedCoreUI.length).toBeGreaterThan(0);

    await context.close();
  });

  test("a URL override survives a reload without the query", async ({ browser }) => {
    // Foundry's join page does not load modules, so opening /game?phonedry=on
    // while logged out loses the query in the redirect and the override never
    // reaches this module. Remembering it for the tab is what makes the escape
    // hatch survive the reload that usually follows using it.
    const context = await browser.newContext();
    const page = await context.newPage();

    await joinGame(page);
    await reloadAt(page, { width: 1280, height: 900 }, "?phonedry=on");
    expect((await readState(page)).phonedryActive, "override did not apply").toBe(true);

    await reloadAt(page, { width: 1280, height: 900 });
    expect((await readState(page)).phonedryActive, "override did not survive a reload").toBe(true);

    // And it can be given back, so a desktop client is not stuck with it.
    await reloadAt(page, { width: 1280, height: 900 }, "?phonedry=auto");
    expect((await readState(page)).phonedryActive).toBe(false);

    await context.close();
  });

  test("?phonedry=off gives a way back from a phone", async ({ browser }) => {
    const context = await browser.newContext(TOUCH);
    const page = await context.newPage();

    await joinGame(page);
    await reloadAt(page, PHONE_VIEWPORT, "?phonedry=off");
    const state = await readState(page);

    // This is the escape hatch a player uses when the sheet has failed and the
    // sidebar is gone. If it stops working, a broken release strands everyone
    // on it with no route back short of clearing site data.
    expect(state.phonedryActive).toBe(false);
    expect(state.shellPresent).toBe(false);
    expect(state.noCanvas).toBe(false);

    await context.close();
  });
});
