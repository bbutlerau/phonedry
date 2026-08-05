import { test, expect, devices } from "@playwright/test";
import { joinGame, longPress, reloadAt, collectErrors, PHONE_VIEWPORT } from "./helpers/foundry.mjs";

/**
 * The inventory screen.
 *
 * The grouping, sorting and weights are covered by unit tests against plain
 * objects. What needs a live world is what those cannot reach: that dnd5e's real
 * items land in the groups expected of them, and — the reason this screen exists
 * at all — that equipping a weapon here actually puts it on the actions screen.
 * That was the hole the actions tab opened, and closing it is the only assertion
 * here that would be worth the eight seconds on its own.
 */

const TOUCH = { ...devices["iPhone 15"], viewport: undefined };

test.describe("inventory", () => {
  test("groups belongings by where they are, and equipping one reaches dnd5e", async ({ browser }) => {
    const context = await browser.newContext(TOUCH);
    const page = await context.newPage();
    const errors = collectErrors(page);

    await joinGame(page);
    await reloadAt(page, PHONE_VIEWPORT);
    await page.locator('.phonedry-tabs__tab[data-tab="items"]').click();

    await expect(page.locator('.phonedry-tabs__tab[data-tab="items"]'))
      .toHaveAttribute("aria-current", "page");

    /* --- grouped by where a thing is --- */

    const headings = page.locator(".phonedry-section__heading");
    await expect(headings.first()).toBeVisible();

    // Loose items first: what is in hand is reached for before what is packed.
    const headingText = await headings.allInnerTexts();
    expect(headingText[0], "carried items should lead").toMatch(/carried/i);
    expect(headingText.join("|"), "the pack should head its own group")
      .toMatch(/Priest's Pack/);

    // The cleric owns two lamps, one in hand and one at the bottom of the pack.
    // Grouped by type they are an unexplained duplicate; grouped by container
    // they are two obvious facts, which is the whole argument for this layout.
    // Keyed rather than located by heading: the carried group's heading is a
    // translated string and a container's is whatever the player called their
    // pack, so neither identifies a group reliably.
    const carried = page.locator('.phonedry-section[data-group="carried"]');
    const pack = page.locator(".phonedry-section", { has: page.locator(".phonedry-section__heading--container") });

    await expect(carried.locator(".phonedry-item__name", { hasText: "Lamp" })).toHaveCount(1);
    await expect(pack.locator(".phonedry-item__name", { hasText: "Lamp" })).toHaveCount(1);

    // Things inside the pack stay inside it.
    await expect(pack.locator(".phonedry-item", { hasText: "Rations" })).toHaveCount(1);
    await expect(carried.locator(".phonedry-item", { hasText: "Rations" })).toHaveCount(0);

    // The container appears exactly once, as a heading rather than also as a
    // row — named twice, the player has to work out which one is the pack.
    await expect(page.locator(".phonedry-item", { hasText: "Priest's Pack" })).toHaveCount(0);

    // The heading carries what the missing row would have: a weight covering
    // the pack and everything in it, and its own equip toggle.
    const packHeading = page.locator(".phonedry-section__heading--container");
    await expect(packHeading.locator(".phonedry-item__weight")).not.toBeEmpty();
    await expect(packHeading.locator(".phonedry-item__equip")).toHaveCount(1);

    /* --- what a row says --- */

    // Loot is the one physical type dnd5e does not make equippable, so the
    // column is held open and left empty rather than filled with a dead
    // control. A phone has no tooltip to explain a disabled toggle.
    const parchment = page.locator(".phonedry-item", { hasText: "Parchment" });
    await expect(parchment.locator(".phonedry-item__equip--fixed")).toHaveCount(1);
    await expect(parchment.locator("button.phonedry-item__equip")).toHaveCount(0);

    // Twelve sheets of it, said beside the name rather than out with the
    // numbers — "Parchment ×12" reads as one fact.
    await expect(parchment.locator(".phonedry-item__quantity")).toHaveText("×12");

    // Chain mail is the heaviest thing the cleric owns and the reason they are
    // over capacity, so the weight column has to be carrying real numbers.
    await expect(
      page.locator(".phonedry-item", { hasText: "Chain Mail" }).locator(".phonedry-item__weight")
    ).toContainText("55");

    /* --- the carrying strip --- */

    // The cleric is a pound over 120, which is the one carrying rule that
    // applies whatever encumbrance variant the table is playing.
    await expect(page.locator(".phonedry-carry__load")).toHaveClass(/phonedry-carry__load--over/);
    await expect(page.locator(".phonedry-carry__weight")).toContainText("/");

    // Nothing is attuned and the limit is three. Shown as a count rather than
    // enforced: dnd5e counts attunements and leaves the ruling to the table.
    await expect(page.locator(".phonedry-attunement")).toContainText("/3");

    // The purse always says something: the coin held, or "no coin". An empty
    // space where money goes reads as the sheet not knowing. Which of the two
    // shows depends on what Brad last picked up on the phone, so the assertion
    // is that one of them is there rather than which.
    await expect(page.locator(".phonedry-coins")).toBeVisible();
    await expect(page.locator(".phonedry-coins")).not.toBeEmpty();

    /* --- reading a row --- */

    // Tapping reads, which on this screen is the row's primary action: using an
    // item lives on the actions screen and equipping has its own control, so
    // nothing else competes for the tap.
    await expect(page.locator(".phonedry-describe")).toBeHidden();
    await page.locator(".phonedry-item", { hasText: "Chain Mail" }).locator(".phonedry-item__read").click();

    await expect(page.locator(".phonedry-describe")).toBeVisible();
    await expect(page.locator(".phonedry-describe__name")).toHaveText("Chain Mail");

    /*
     * Chain mail carries no description text at all in this world — dnd5e ships
     * it blank — so the facts are the whole of the panel and the absence is
     * stated rather than shown as an empty box. Both halves matter: without the
     * facts there is nothing to read, and without the note the panel looks like
     * it failed to load.
     */
    const facts = page.locator(".phonedry-describe__fact");
    await expect(facts.filter({ hasText: /armour class/i })).toContainText("16");
    await expect(facts.filter({ hasText: /properties/i })).toContainText("Stealth");
    await expect(page.locator(".phonedry-describe__body--empty")).toBeVisible();

    await page.locator(".phonedry-describe__close").click();
    await expect(page.locator(".phonedry-describe")).toBeHidden();

    // The hold answers the same question, so the gesture learned on the spells
    // screen keeps working here rather than silently doing nothing.
    await longPress(page, page.locator(".phonedry-item", { hasText: "Mace" }).locator(".phonedry-item__read"));
    await expect(page.locator(".phonedry-describe__name")).toHaveText("Mace");

    // A weapon leads with what it hits and what it does, and the damage carries
    // its type — unlike an action row, where the full label does not fit.
    await expect(facts.filter({ hasText: /attack/i })).toContainText("+");
    await expect(facts.filter({ hasText: /damage/i })).toContainText("1d6");
    await expect(facts.filter({ hasText: /damage/i })).toContainText("Bludgeoning");

    await page.locator(".phonedry-describe__close").click();
    await expect(page.locator(".phonedry-describe")).toBeHidden();

    /* --- equipping, which is why this screen exists --- */

    // The actions screen filters weapons on `system.equipped`, so before this
    // screen a player who drew a different weapon mid-fight had no way to make
    // it appear. That is the hole being closed, and this is the assertion that
    // proves it closed: the shortsword is in the pack and off the actions list.
    const equipped = () => page.evaluate(() =>
      game.user.character.items.find(i => i.name === "Shortsword")?.system.equipped);

    /*
     * The starting state is read rather than assumed. This world is the one
     * Brad tests on by hand, so anything left equipped from a session on the
     * phone would fail a test that insisted the shortsword began in the pack —
     * and that failure would say nothing about the code.
     */
    const before = await equipped();
    const shortsword = page.locator(".phonedry-item", { hasText: "Shortsword" });
    const equip = shortsword.locator("button.phonedry-item__equip");
    await expect(equip).toHaveAttribute("aria-pressed", String(before));

    await equip.click();

    // dnd5e is what the write has to reach — the toggle repainting itself would
    // prove nothing.
    await expect.poll(equipped).toBe(!before);
    await expect(equip).toHaveAttribute("aria-pressed", String(!before));

    // And the actions screen follows, which is the hole this closes: it lists a
    // weapon only while equipped, so the row appears or disappears to match.
    await page.locator('.phonedry-tabs__tab[data-tab="actions"]').click();
    await expect(page.locator(".phonedry-action__name", { hasText: "Shortsword" }))
      .toHaveCount(before ? 0 : 1);

    // Put it back, so the world is left as it was found.
    await page.locator('.phonedry-tabs__tab[data-tab="items"]').click();
    await shortsword.locator("button.phonedry-item__equip").click();
    await expect.poll(equipped).toBe(before);

    /* --- picking something up --- */

    // Start from a known state: this adds an item, and a leftover from an
    // earlier failure would make the count assertion below meaningless.
    await page.evaluate(async () => {
      const actor = game.modules.get("phonedry").api.shell.actor;
      for ( const stray of actor.items.filter(i => i.name === "Caltrops") ) await stray.delete();
    });

    await page.locator("[data-action='openBrowser'][data-browser='items']").click();
    await expect(page.locator(".phonedry-browser")).toBeVisible();

    // Opening must not stall. Five packs and over two thousand entries are
    // walked here, and doing it on every keystroke rather than once per session
    // is the mistake this guards against.
    await expect(page.locator(".phonedry-browser__result").first()).toBeVisible({ timeout: 3_000 });
    await expect(page.locator(".phonedry-browser__note")).toContainText("Showing");

    /*
     * One row per named thing. Gear is published under both rules versions and
     * again by the Player's Handbook and Dungeon Master's Guide modules, so
     * "chain mail" arrives from four packs under different identifiers —
     * deduplicating by identifier alone leaves four rows a player cannot choose
     * between.
     */
    await page.locator(".phonedry-browser__search").fill("chain mail");
    await expect.poll(() => page.locator(".phonedry-browser__name").allInnerTexts())
      .toContain("Chain Mail");

    // Exactly one of it. The +1, +2 and Adamantine versions are genuinely
    // different items and stay; what must not survive is the same chain mail
    // from four packs.
    await expect.poll(() => page.locator(".phonedry-browser__name").allInnerTexts()
      .then(names => names.filter(n => n.trim() === "Chain Mail").length)).toBe(1);

    // Rows say what kind of thing they are, which is the question asked of a
    // name that could be anything — and say it in words rather than in the
    // localisation key core hands out.
    const meta = page.locator(".phonedry-browser__meta").first();
    await expect(meta).not.toBeEmpty();
    await expect(meta, "an unlocalised label reached the screen").not.toContainText("TYPES.");

    /* --- reading before committing --- */

    // The same gesture as the spell browser, and for the same reason: the item
    // is not on the character yet, so there is no row on the sheet to hold.
    //
    // Held by exact name rather than by position: the list is alphabetical, so
    // the first row matching "chain mail" is the Adamantine one.
    const plainChainMail = page.locator(".phonedry-browser__result").filter({
      has: page.locator(".phonedry-browser__name", { hasText: /^Chain Mail$/ })
    });

    await longPress(page, plainChainMail);
    await expect(page.locator(".phonedry-describe__name")).toHaveText("Chain Mail");
    await page.locator(".phonedry-describe__close").click();

    /* --- and adding it --- */

    await page.locator(".phonedry-browser__search").fill("caltrops");
    await expect.poll(() => page.locator(".phonedry-browser__name").allInnerTexts())
      .toEqual(["Caltrops"]);

    await page.locator("[data-action='addFromBrowser']").first().click();

    // dnd5e is what the write has to reach.
    await expect.poll(() => page.evaluate(() =>
      game.modules.get("phonedry").api.shell.actor.items.filter(i => i.name === "Caltrops").length))
      .toBe(1);

    /*
     * Nothing is marked as already owned, unlike the spell browser. A character
     * can carry a second rope and a third torch, so refusing a duplicate would
     * refuse the most ordinary use of this screen.
     */
    await expect(page.locator("[data-action='addFromBrowser']").first()).toBeEnabled();

    await page.locator("[data-action='closeBrowser']").click();
    await expect(page.locator(".phonedry-browser")).toBeHidden();

    // And it is on the sheet behind the browser, which had to re-render for it
    // to be there.
    await expect(page.locator(".phonedry-item", { hasText: "Caltrops" })).toHaveCount(1);

    // Leave the world as it was found.
    await page.evaluate(async () => {
      const actor = game.modules.get("phonedry").api.shell.actor;
      for ( const stray of actor.items.filter(i => i.name === "Caltrops") ) await stray.delete();
    });

    /* --- attuning --- */

    // Nothing in this world requires attunement, so the control cannot be
    // exercised against real data here. What can be checked is that the count
    // is present and reads from dnd5e's own tally rather than from ours.
    expect(await page.evaluate(() => game.user.character.system.attributes.attunement.max))
      .toBeGreaterThan(0);

    expect(errors).toEqual([]);
    await context.close();
  });
});
