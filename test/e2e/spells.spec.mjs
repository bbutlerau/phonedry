import { test, expect, devices } from "@playwright/test";
import { joinGame, reloadAt, collectErrors, PHONE_VIEWPORT } from "./helpers/foundry.mjs";

/**
 * Tab bar and spells screen.
 *
 * The spells mapper is covered by unit tests. What needs a live world here is
 * that the tab bar actually swaps the section, and that preparing and casting
 * reach dnd5e rather than only looking as though they have.
 */

const TOUCH = { ...devices["iPhone 15"], viewport: undefined };

test.describe("spells", () => {
  test("the tab bar swaps sections", async ({ browser }) => {
    const context = await browser.newContext(TOUCH);
    const page = await context.newPage();
    const errors = collectErrors(page);

    await joinGame(page);
    await reloadAt(page, PHONE_VIEWPORT);

    // Stats is where a session starts, and the bar says so.
    await expect(page.locator('.phonedry-tabs__tab[data-tab="stats"]')).toHaveAttribute("aria-current", "page");
    await expect(page.locator(".phonedry-skills")).toBeVisible();
    await expect(page.locator(".phonedry-spells")).toHaveCount(0);

    await page.locator('.phonedry-tabs__tab[data-tab="spells"]').click();

    await expect(page.locator('.phonedry-tabs__tab[data-tab="spells"]')).toHaveAttribute("aria-current", "page");
    await expect(page.locator(".phonedry-spells").first()).toBeVisible();

    // The inactive section is not built at all, rather than hidden. Laying out
    // a full spell list behind the skills screen would cost a phone real time.
    await expect(page.locator(".phonedry-skills")).toHaveCount(0);

    // The header is shared, and swapping tabs must not disturb it.
    await expect(page.locator(".phonedry-header__name")).not.toBeEmpty();

    await page.locator('.phonedry-tabs__tab[data-tab="stats"]').click();
    await expect(page.locator(".phonedry-skills")).toBeVisible();

    expect(errors).toEqual([]);
    await context.close();
  });

  test("spells are grouped by level with their slots", async ({ browser }) => {
    const context = await browser.newContext(TOUCH);
    const page = await context.newPage();

    await joinGame(page);
    await reloadAt(page, PHONE_VIEWPORT);
    await page.locator('.phonedry-tabs__tab[data-tab="spells"]').click();

    // Slots first: it is the question asked before every cast.
    await expect(page.locator(".phonedry-slot").first()).toBeVisible();

    // Level order, not alphabetical — cantrips lead.
    //
    // Read from the level headings only, and matched rather than compared: the
    // heading also carries a slot count, and the two engines disagree about
    // whether innerText puts it on its own line. Uppercasing is the
    // stylesheet's doing rather than the data's, hence the case-insensitive
    // patterns.
    const headings = await page.locator(".phonedry-section__heading").allInnerTexts();
    expect(headings[1]).toMatch(/^cantrip/i);
    expect(headings[2]).toMatch(/^1st level/i);

    // Cantrips are always available, so they get no prepare control. Located
    // by its heading rather than by position — a structural selector would
    // quietly start pointing at a different section the moment one is added.
    const cantrips = page.locator(".phonedry-section").filter({
      has: page.locator(".phonedry-section__heading", { hasText: /cantrip/i })
    });

    await expect(cantrips.locator(".phonedry-spell")).not.toHaveCount(0);
    await expect(
      cantrips.locator("[data-action='togglePrepared']"),
      "cantrips should not offer a preparation toggle"
    ).toHaveCount(0);

    /* --- and spells granted by something other than the class are marked --- */

    // The test character is a Forest Gnome, whose species grants Minor
    // Illusion. Without the stripe it sits in the cantrip list looking exactly
    // like the ones the class gave, which is the confusion this answers.
    const granted = page.locator(".phonedry-spell--granted");
    await expect(granted).not.toHaveCount(0);
    await expect(granted.first().locator(".phonedry-spell__source")).not.toBeEmpty();

    // Class spells stay unmarked — marking every one would leave nothing
    // standing out.
    const total = await page.locator(".phonedry-spell").count();
    expect(await granted.count()).toBeLessThan(total);

    await context.close();
  });

  test("preparing a spell reaches dnd5e", async ({ browser }) => {
    const context = await browser.newContext(TOUCH);
    const page = await context.newPage();

    await joinGame(page);
    await reloadAt(page, PHONE_VIEWPORT);
    await page.locator('.phonedry-tabs__tab[data-tab="spells"]').click();

    const toggle = page.locator("[data-action='togglePrepared']").first();
    const spellId = await toggle.getAttribute("data-spell-id");
    const prepared = () => page.evaluate(
      // A number in dnd5e 5.x: 0 unprepared, 1 prepared, 2 always.
      id => game.modules.get("phonedry").api.shell.actor.items.get(id).system.prepared,
      spellId
    );

    const before = await prepared();
    await toggle.click();

    // The document is what must change — a toggle that only flipped a class
    // would look right and do nothing.
    await expect.poll(prepared).toBe(before ? 0 : 1);

    // And the sheet follows the document rather than assuming.
    await expect(page.locator(`[data-spell-id="${spellId}"][data-action='togglePrepared']`))
      .toHaveAttribute("aria-pressed", before ? "false" : "true");

    await toggle.click();
    await expect.poll(prepared).toBe(before);

    await context.close();
  });
});
