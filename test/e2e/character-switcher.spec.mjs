import { test, expect, devices } from "@playwright/test";
import { joinGame, longPress, reloadAt, collectErrors, PHONE_VIEWPORT } from "./helpers/foundry.mjs";

/**
 * The character switcher.
 *
 * Holding the portrait or name in the header opens a panel listing the
 * player's other owned characters, and tapping one reassigns
 * `user.character`. What is worth a live world here is what a unit test
 * cannot reach: that the hold actually opens the panel over a dimmed
 * backdrop, that a tap on the backdrop dismisses it without switching, and
 * that a real switch rebuilds the sheet around the new actor.
 *
 * How many characters `phonedrt` owns besides the assigned one is world
 * state this test does not control, so it reads what is actually there
 * rather than assuming a count — the same reasoning the inventory and stats
 * specs use for the cleric's starting gear.
 */

const TOUCH = { ...devices["iPhone 15"], viewport: undefined };

test.describe("character switcher", () => {
  test("holding the portrait opens a dimmed panel; the backdrop dismisses it", async ({ browser }) => {
    const context = await browser.newContext(TOUCH);
    const page = await context.newPage();
    const errors = collectErrors(page);

    await joinGame(page);
    await reloadAt(page, PHONE_VIEWPORT);

    const startingName = await page.locator(".phonedry-header__name").innerText();

    await longPress(page, page.locator(".phonedry-header__portrait"));

    const panel = page.locator(".phonedry-switcher__panel");
    await expect(panel).toBeVisible();
    await expect(panel).toHaveAttribute("aria-modal", "true");

    // Backdrop tap dismisses without switching. The panel is anchored to the
    // top and shorter than the screen, so the dimmed area is below it, not
    // above — clicking near the bottom of the switcher's own bounding box is
    // what lands on the backdrop rather than on the panel.
    const switcherBox = await page.locator(".phonedry-switcher").boundingBox();
    await page.locator(".phonedry-switcher").click({
      position: { x: 5, y: switcherBox.height - 5 }
    });
    await expect(panel).toBeHidden();
    await expect(page.locator(".phonedry-header__name")).toHaveText(startingName);

    expect(errors).toEqual([]);

    await context.close();
  });

  test("names either the other characters owned, or says there are none", async ({ browser }) => {
    const context = await browser.newContext(TOUCH);
    const page = await context.newPage();

    await joinGame(page);
    await reloadAt(page, PHONE_VIEWPORT);

    // `user.character` is world state, not scoped to this browser context —
    // switching it here would otherwise strand every test that runs after
    // this one assuming the cleric is still assigned, in this file or any
    // other. Restored in `finally` so a failed assertion does not skip it.
    const originalCharacterId = await page.evaluate(() => game.user.character?.id ?? null);

    try {
      await longPress(page, page.locator(".phonedry-header__portrait"));

      const candidates = page.locator(".phonedry-switcher__candidate");
      const count = await candidates.count();

      if ( count === 0 ) {
        await expect(page.locator(".phonedry-switcher__empty")).toBeVisible();
      } else {
        const targetName = await candidates.first().locator(".phonedry-switcher__name").innerText();

        await candidates.first().click();
        await expect(page.locator(".phonedry-switcher")).toBeHidden();

        // A real switch, not just a closed panel: the header now shows the
        // character that was tapped, and the sheet landed back on the stats
        // screen — the reset the `updateUser` hook is responsible for.
        await expect(page.locator(".phonedry-header__name")).toHaveText(targetName);
        await expect(page.locator('.phonedry-tabs__tab[data-tab="stats"]'))
          .toHaveAttribute("aria-current", "page");
      }
    } finally {
      if ( originalCharacterId ) {
        await page.evaluate(id => game.user.update({ character: id }), originalCharacterId);
      }
    }

    await context.close();
  });
});
