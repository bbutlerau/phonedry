import { test, expect, devices } from "@playwright/test";
import { joinGame, longPress, reloadAt, collectErrors, PHONE_VIEWPORT } from "./helpers/foundry.mjs";

/**
 * The features screen, and tool checks on the stats screen.
 *
 * The grouping and the trait labelling are covered by unit tests against plain
 * objects. What needs a live world is the claim those cannot make: that dnd5e's
 * real features land on exactly one of the two screens that share them. Before
 * this screen existed, a feature with no activity appeared nowhere at all, and
 * the way that comes back is the two mappers disagreeing about what "passive"
 * means.
 */

const TOUCH = { ...devices["iPhone 15"], viewport: undefined };

test.describe("features", () => {
  test("passive features and traits are readable, and tools roll", async ({ browser }) => {
    const context = await browser.newContext(TOUCH);
    const page = await context.newPage();
    const errors = collectErrors(page);

    await joinGame(page);
    await reloadAt(page, PHONE_VIEWPORT);

    /* --- the tab bar at six --- */

    expect(await page.locator(".phonedry-tabs__tab").evaluateAll(
      els => els.map(el => el.dataset.tab)
    )).toEqual(["stats", "actions", "spells", "items", "conditions", "features"]);

    /*
     * Six tabs at 393px is 65px each, and a label that wraps puts one tab on
     * two lines and grows the whole bar — which reads as a broken layout rather
     * than as a long word.
     */
    const tabRows = await page.locator(".phonedry-tabs__tab").evaluateAll(
      els => [...new Set(els.map(el => Math.round(el.getBoundingClientRect().top)))]
    );
    expect(tabRows, "the tab bar wrapped").toHaveLength(1);

    /*
     * And every label has room to spare inside its tab.
     *
     * This is the assertion that was missing. "Does not wrap" and "the page
     * does not scroll sideways" were both true while `Features` rendered hard
     * against the edge of a real iPhone with its label touching both sides:
     * the shell sets `overflow: hidden`, so an overflowing bar is clipped
     * rather than scrolled and neither check could see it. Font metrics differ
     * enough between engines that a fit measured to the pixel in Chromium
     * proves nothing on a device, so the claim is a few pixels of slack.
     */
    const labels = await page.locator(".phonedry-tabs__label").evaluateAll(
      els => els.map(el => ({
        text: el.textContent.trim(),
        needed: el.scrollWidth,
        available: el.closest(".phonedry-tabs__tab").clientWidth
      }))
    );

    for ( const { text, needed, available } of labels ) {
      expect(needed, `the "${text}" tab label has no room to spare`)
        .toBeLessThanOrEqual(available - 6);
    }

    /* --- tools, under skills --- */

    // The cleric is proficient with Calligrapher's Supplies, and its name comes
    // from a compendium item rather than from config — so an unresolved label
    // shows as the raw key.
    const tools = page.locator(".phonedry-section", {
      has: page.locator(".phonedry-section__heading", { hasText: /tools/i })
    });

    await expect(tools).toBeVisible();

    const tool = tools.locator(".phonedry-skill").first();
    await expect(tool.locator(".phonedry-skill__name")).not.toBeEmpty();
    await expect(tool.locator(".phonedry-skill__name"),
      "an unresolved tool key reached the screen").not.toHaveText(/^[a-z]+$/);
    await expect(tool.locator(".phonedry-skill__mod")).toContainText(/[+-]/);

    // The load-bearing assertion: the tap reaches dnd5e. A chat card is the
    // observable proof, and it is also what the roll log picks up.
    const before = await page.evaluate(() => game.messages.size);
    await tool.click();
    await page.waitForFunction(n => game.messages.size > n, before, { timeout: 10_000 });

    /* --- the features screen --- */

    await page.locator('.phonedry-tabs__tab[data-tab="features"]').click();
    await expect(page.locator('.phonedry-tabs__tab[data-tab="features"]'))
      .toHaveAttribute("aria-current", "page");

    const names = await page.locator(".phonedry-feature__name").allInnerTexts();

    // Passives the actions screen cannot show, because there is nothing on them
    // to activate. These are exactly the features that were invisible before.
    expect(names, "a passive class feature is missing").toContain("Spellcasting");
    expect(names).toContain("Divine Order");

    // And things the actions screen does show stay there rather than being
    // listed twice under two different promises.
    expect(names, "an activatable feature was listed here too").not.toContain("Radiance of the Dawn");
    expect(names).not.toContain("Warding Flare");

    // The containers are not the contents. "Cleric" and "Gnome, Forest" are
    // already named in the header; what they grant arrives as separate items.
    expect(names).not.toContain("Cleric");
    expect(names).not.toContain("Light Domain");

    /*
     * The partition, checked against the live world rather than a fixture: every
     * feat item on the character is on one screen or the other, and none is on
     * both. This is the assertion the whole screen exists for.
     */
    const split = await page.evaluate(() => {
      const shell = game.modules.get("phonedry").api.shell;
      const feats = shell.actor.items.filter(i => i.type === "feat").map(i => i.id);
      return { feats };
    });

    const featureIds = await page.locator("[data-action='describeItem']").evaluateAll(
      els => els.map(el => el.dataset.itemId)
    );

    await page.locator('.phonedry-tabs__tab[data-tab="actions"]').click();
    const actionIds = await page.locator("[data-action='useActivity']").evaluateAll(
      els => els.map(el => el.dataset.itemId)
    );

    for ( const id of split.feats ) {
      const here = featureIds.includes(id);
      const there = actionIds.includes(id);
      expect(here || there, `a feature is on neither screen (${id})`).toBe(true);
      expect(here && there, `a feature is on both screens (${id})`).toBe(false);
    }

    await page.locator('.phonedry-tabs__tab[data-tab="features"]').click();

    /* --- traits --- */

    const traits = page.locator(".phonedry-trait");
    await expect(traits.first()).toBeVisible();

    const terms = (await page.locator(".phonedry-trait__term").allInnerTexts())
      .map(t => t.toLowerCase());

    // The cleric speaks three languages and is proficient with every armour.
    expect(terms.join("|")).toMatch(/languages/);
    await expect(traits.filter({ hasText: /languages/i })).toContainText("Common");
    await expect(traits.filter({ hasText: /armour/i })).toContainText("Shields");

    // A Forest Gnome is Small, which is the kind of fact players forget.
    await expect(traits.filter({ hasText: /size/i })).toContainText("Small");

    /* --- reading one --- */

    // Tapping reads, as on the inventory screen: there is nothing to *do* with
    // a passive feature, which is what makes it passive.
    await expect(page.locator(".phonedry-describe")).toBeHidden();
    await page.locator(".phonedry-feature", { hasText: "Spellcasting" }).first()
      .locator(".phonedry-feature__read").click();

    await expect(page.locator(".phonedry-describe")).toBeVisible();
    await expect(page.locator(".phonedry-describe__name")).toHaveText("Spellcasting");
    await page.locator(".phonedry-describe__close").click();
    await expect(page.locator(".phonedry-describe")).toBeHidden();

    // The hold works too, so the gesture learned elsewhere keeps working here.
    await longPress(page, page.locator(".phonedry-feature", { hasText: "Divine Order" }).first()
      .locator(".phonedry-feature__read"));
    await expect(page.locator(".phonedry-describe")).toBeVisible();

    expect(errors).toEqual([]);
    await context.close();
  });
});
