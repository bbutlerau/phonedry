import { test, expect, devices } from "@playwright/test";
import { joinGame, longPress, reloadAt, collectErrors, PHONE_VIEWPORT } from "./helpers/foundry.mjs";

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

    // The bar is generated from the TABS list, so its order is the order of a
    // fight: what is reached for every round comes before what is reached for
    // when there is a spell to cast.
    expect(await page.locator(".phonedry-tabs__tab").evaluateAll(
      els => els.map(el => el.dataset.tab)
    )).toEqual(["stats", "actions", "spells", "items", "conditions", "features"]);

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

    /*
     * And they are all the same height.
     *
     * The grid row measures a few pixels taller than any slot in it, and with
     * the default stretch that gap was filled for the last slot only — so the
     * fourth-level box stood visibly taller than the three beside it. Unlike
     * most layout faults on this sheet, this one is plainly visible to
     * Chromium, so it is worth asserting rather than leaving to a device.
     */
    const slotHeights = await page.locator(".phonedry-slot").evaluateAll(
      els => [...new Set(els.map(el => Math.round(el.getBoundingClientRect().height)))]
    );
    expect(slotHeights, "the spell slot boxes are not all the same height").toHaveLength(1);

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
    await page.locator("[data-action='openBrowser'][data-browser='spells']").click();
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
    await longPress(page, page.locator("[data-action='addFromBrowser']").first());
    await expect(page.locator(".phonedry-describe__name")).toHaveText("Inflict Wounds");
    await expect(page.locator(".phonedry-describe__body")).not.toBeEmpty();

    const before = await page.evaluate(
      () => game.modules.get("phonedry").api.shell.actor.items.filter(i => i.type === "spell").length
    );

    // Reading it must not add it — the hold and the tap share a control.
    expect(await page.evaluate(
      () => game.modules.get("phonedry").api.shell.actor.items.some(i => i.name === "Inflict Wounds")
    ), "holding a result added the spell").toBe(false);

    await page.locator(".phonedry-describe__close").click();
    await page.locator("[data-action='addFromBrowser']").first().click();

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
    await expect(page.locator("[data-action='addFromBrowser']").first()).toBeDisabled();

    await page.locator("[data-action='closeBrowser']").click();
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

    await page.locator(".phonedry-describe__close").click();
    await expect(page.locator(".phonedry-describe")).toBeHidden();

    expect(errors).toEqual([]);
    await context.close();
  });

  test("preparing a spell leaves the list where it was", async ({ browser }) => {
    const context = await browser.newContext(TOUCH);
    const page = await context.newPage();

    await joinGame(page);
    await reloadAt(page, PHONE_VIEWPORT);
    await page.locator('.phonedry-tabs__tab[data-tab="spells"]').click();

    const content = page.locator(".phonedry-content");

    // Preparing updates the item, which re-renders the sheet. Without core's
    // scroll preservation the list jumps to the top, so a player working
    // through their spells is thrown back after every single one — and the
    // further down they are, the worse it gets.
    await content.evaluate(el => el.scrollTop = 400);
    const before = await content.evaluate(el => el.scrollTop);
    expect(before, "the list is not long enough for this test to mean anything")
      .toBeGreaterThan(0);

    const toggle = page.locator("[data-action='togglePrepared']").last();
    await toggle.scrollIntoViewIfNeeded();
    const scrolled = await content.evaluate(el => el.scrollTop);

    await toggle.click();

    // Polled rather than read once: the render happens on the item update
    // arriving back, not on the click.
    await expect.poll(() => content.evaluate(el => el.scrollTop),
      { message: "the list scrolled after preparing a spell" }).toBe(scrolled);

    // Put it back, so a rerun starts from the same state.
    await toggle.click();

    /* --- but a different section starts at the top --- */

    // The other half of the rule: a position measured against the spell list
    // means nothing against the skills list, and restoring it would land the
    // player halfway down a list they have not seen the top of.
    await page.locator('.phonedry-tabs__tab[data-tab="stats"]').click();
    await expect.poll(() => content.evaluate(el => el.scrollTop)).toBe(0);

    await context.close();
  });

  test("a spell aimed at creatures asks who, and tells dnd5e", async ({ browser }) => {
    const context = await browser.newContext(TOUCH);
    const page = await context.newPage();
    const errors = collectErrors(page);

    await joinGame(page);
    await reloadAt(page, PHONE_VIEWPORT);
    await page.locator('.phonedry-tabs__tab[data-tab="spells"]').click();

    // Only runs where the world has an encounter to pick from. Skipped rather
    // than failed: the picker falls back to the party without one, and that is
    // a different path than this test is about.
    const inCombat = await page.evaluate(() => !!game.combats.active?.combatants.size);
    test.skip(!inCombat, "no active encounter in the test world");

    /*
     * Give the slot back before spending it.
     *
     * This test casts Bless, and the cleric has four first-level slots. Nothing
     * gives them back — no long rest runs between suite runs — so the fourth
     * run of the day found the character out of slots, dnd5e correctly refused
     * the cast, no card was posted, and the failure pointed at targeting rather
     * than at an empty spell book. The world is also the one Brad tests on by
     * hand, which drains them faster still.
     */
    await page.evaluate(() => {
      const actor = game.modules.get("phonedry").api.shell.actor;
      const { max } = actor.system.spells.spell1;
      return actor.update({ "system.spells.spell1.value": max });
    });

    /* --- a template spell casts straight through --- */

    // Burning Hands is a cone. Who is caught in it needs the map this client
    // does not draw, so offering a name list would invite a player to pick
    // three and believe the area had been resolved.
    const before = await page.evaluate(() => game.messages.size);
    await page.locator(".phonedry-spell__cast", { hasText: "Burning Hands" }).first().click();
    await expect(page.locator(".phonedry-targets"),
      "a template spell should not ask for targets").toBeHidden();

    // It reaches dnd5e's usage dialog instead, which is the normal path.
    await page.keyboard.press("Escape");

    /* --- a creature spell asks first --- */

    await page.locator(".phonedry-spell__cast", { hasText: "Bless" }).first().click();

    const picker = page.locator(".phonedry-targets");
    await expect(picker).toBeVisible();

    // Enemies lead: in a fight the common case is aiming at the thing trying to
    // kill you, and the list is read under time pressure.
    //
    // Matched case-insensitively because the uppercasing is the stylesheet's
    // doing rather than the data's, the same as the spell level headings.
    expect((await page.locator(".phonedry-targets__heading").allInnerTexts())
      .map(t => t.toLowerCase())).toEqual(["enemies", "allies"]);

    // Nothing was cast merely by opening the picker.
    expect(await page.evaluate(() => game.messages.size)).toBe(before);

    const rows = page.locator(".phonedry-target");
    await rows.first().click();
    await expect(rows.first()).toHaveAttribute("aria-pressed", "true");

    await page.locator("[data-action='confirmTargets']").click();
    await expect(picker).toBeHidden();

    // dnd5e's own usage dialog comes next, to pick the slot. It is deliberately
    // kept — it carries the slot and upcasting rules — so the card only exists
    // once it is confirmed.
    const usage = page.locator("dialog.application.activity-usage");
    await expect(usage).toBeVisible();
    await usage.locator("[data-action='use']").click();

    /* --- and dnd5e is told who --- */

    // The load-bearing assertion. dnd5e builds this list from `game.user.targets`,
    // a set of canvas tokens that is permanently empty here — so without the
    // flags being supplied the card names nobody, and per-target save buttons
    // have nothing to act on.
    await expect.poll(() => page.evaluate(
      () => [...game.messages].at(-1)?.getFlag("dnd5e", "targets")?.map(t => t.name) ?? []
    ), { message: "the chat card did not carry the chosen targets" }).not.toEqual([]);

    const flagged = await page.evaluate(
      () => [...game.messages].at(-1).getFlag("dnd5e", "targets")
    );
    expect(flagged[0]).toHaveProperty("uuid");
    expect(flagged[0]).toHaveProperty("ac");

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
