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
async function longPress(page, locator) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();

  await page.mouse.move(box.x + (box.width / 2), box.y + (box.height / 2));
  await page.mouse.down();
  await page.waitForTimeout(800);
  await page.mouse.up();
}

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

  test("spells can be found and added from the compendium", async ({ browser }) => {
    const context = await browser.newContext(TOUCH);
    const page = await context.newPage();
    const errors = collectErrors(page);

    await joinGame(page);
    await reloadAt(page, PHONE_VIEWPORT);

    // Start from a known state. This test adds a spell, and an earlier failure
    // used to leave it behind — after which the browser correctly showed it as
    // already known and the test failed on a disabled button, pointing at
    // entirely the wrong thing.
    await page.evaluate(async () => {
      const actor = game.modules.get("phonedry").api.shell.actor;
      const stray = actor.items.find(i => i.name === "Inflict Wounds");
      if ( stray ) await stray.delete();
    });

    await page.locator('.phonedry-tabs__tab[data-tab="spells"]').click();
    await page.locator("[data-action='openSpellBrowser']").click();
    await expect(page.locator(".phonedry-browser")).toBeVisible();

    // Opening must not stall. The obvious implementation asks the compendium
    // for spell levels, which costs a re-index of about ten seconds — long
    // enough that a player would think the sheet had hung.
    await expect(page.locator(".phonedry-browser__result").first()).toBeVisible({ timeout: 3_000 });

    // The list is capped, and says so rather than looking complete.
    await expect(page.locator(".phonedry-browser__note")).toContainText("Showing");

    /* --- ordering by level and school --- */

    // Both are only possible because the boot path asks Foundry to carry them
    // in its compendium index. Fetching them on demand instead costs a rebuild
    // of about ten seconds, so if this ever comes back empty the cause is that
    // registration, not the sort.
    await page.locator('[data-sort="level"]').click();
    await expect(page.locator(".phonedry-browser__meta").first()).toContainText(/cantrip/i);

    const levels = await page.locator(".phonedry-browser__result")
      .evaluateAll(els => els.map(el => Number(el.dataset.level)));
    expect(levels, "results are not in level order")
      .toEqual([...levels].sort((a, b) => a - b));

    await page.locator('[data-sort="school"]').click();
    const schools = await page.locator(".phonedry-browser__meta")
      .allInnerTexts()
      .then(texts => texts.map(t => t.split("·").at(-1).trim()));
    expect(schools, "results are not in school order")
      .toEqual([...schools].sort((a, b) => a.localeCompare(b)));

    await page.locator('[data-sort="name"]').click();

    await page.locator(".phonedry-browser__search").fill("inflict wounds");
    await expect.poll(
      () => page.locator(".phonedry-browser__name").allInnerTexts()
    ).toEqual(["Inflict Wounds"]);

    /* --- reading a spell before committing to it --- */

    // The point of the gesture here: the spell is not on the character yet, so
    // the panel has to resolve a compendium uuid rather than an owned item.
    await longPress(page, page.locator("[data-action='addSpell']").first());
    await expect(page.locator(".phonedry-describe__name")).toHaveText("Inflict Wounds");
    await expect(page.locator(".phonedry-describe__body")).not.toBeEmpty();

    const before = await page.evaluate(
      () => game.modules.get("phonedry").api.shell.actor.items.filter(i => i.type === "spell").length
    );

    // Reading it must not add it — the hold and the tap share a control.
    expect(await page.evaluate(
      () => game.modules.get("phonedry").api.shell.actor.items.some(i => i.name === "Inflict Wounds")
    ), "holding a result added the spell").toBe(false);

    await page.locator("[data-action='closeDescription']").click();
    await page.locator("[data-action='addSpell']").first().click();

    // The document is what must change. It also has to arrive with its
    // compendium source recorded, which is what lets the sheet say later where
    // a spell came from.
    await expect.poll(
      () => page.evaluate(() => {
        const actor = game.modules.get("phonedry").api.shell.actor;
        const added = actor.items.find(i => i.name === "Inflict Wounds");
        return added ? !!added._stats?.compendiumSource : false;
      })
    ).toBe(true);

    // And it is now marked as known rather than offered again.
    await expect(page.locator("[data-action='addSpell']").first()).toBeDisabled();

    await page.locator("[data-action='closeSpellBrowser']").click();
    await expect(page.locator(".phonedry-browser")).toBeHidden();

    // Tidy up, so the suite can be run repeatedly.
    await page.evaluate(async () => {
      const actor = game.modules.get("phonedry").api.shell.actor;
      const added = actor.items.find(i => i.name === "Inflict Wounds");
      if ( added ) await added.delete();
    });
    await expect.poll(
      () => page.evaluate(
        () => game.modules.get("phonedry").api.shell.actor.items.filter(i => i.type === "spell").length
      )
    ).toBe(before);

    expect(errors).toEqual([]);
    await context.close();
  });

  test("holding a spell shows what it does, without casting it", async ({ browser }) => {
    const context = await browser.newContext(TOUCH);
    const page = await context.newPage();
    const errors = collectErrors(page);

    await joinGame(page);
    await reloadAt(page, PHONE_VIEWPORT);
    await page.locator('.phonedry-tabs__tab[data-tab="spells"]').click();

    await expect(page.locator(".phonedry-describe")).toBeHidden();

    const before = await page.evaluate(() => game.messages.size);
    await longPress(page, page.locator(".phonedry-spell__cast", { hasText: "Cure Wounds" }).first());

    await expect(page.locator(".phonedry-describe")).toBeVisible();
    await expect(page.locator(".phonedry-describe__name")).toHaveText("Cure Wounds");

    // The description is Foundry's markup until it is enriched — inline rolls
    // and references would otherwise read as raw text on the page.
    await expect(page.locator(".phonedry-describe__body")).toContainText("2d8");
    const raw = await page.locator(".phonedry-describe__body").innerHTML();
    expect(raw, "description was not enriched").not.toMatch(/\[\[|@UUID|&Reference/);

    // The load-bearing assertion. A hold that also fired the tap would read the
    // spell and cast it, spending a slot the player never meant to spend.
    expect(await page.evaluate(() => game.messages.size),
      "holding a spell also cast it").toBe(before);

    await page.locator("[data-action='closeDescription']").click();
    await expect(page.locator(".phonedry-describe")).toBeHidden();

    expect(errors).toEqual([]);
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
