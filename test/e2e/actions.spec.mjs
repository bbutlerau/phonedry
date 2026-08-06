import { test, expect, devices } from "@playwright/test";
import { joinGame, longPress, reloadAt, collectErrors, PHONE_VIEWPORT } from "./helpers/foundry.mjs";

/**
 * The actions screen.
 *
 * The grouping and filtering are covered by unit tests against plain objects.
 * What needs a live world is the part those cannot reach: that dnd5e's real
 * items produce the rows expected of them — equipped weapons and not the ones
 * in the pack, one row per activity on a multi-activity feature — and that
 * tapping a row reaches dnd5e rather than only looking as though it has.
 */

const TOUCH = { ...devices["iPhone 15"], viewport: undefined };

test.describe("actions", () => {
  test("lists usable activities and using one reaches dnd5e", async ({ browser }) => {
    const context = await browser.newContext(TOUCH);
    const page = await context.newPage();
    const errors = collectErrors(page);

    await joinGame(page);
    await reloadAt(page, PHONE_VIEWPORT);
    await page.locator('.phonedry-tabs__tab[data-tab="actions"]').click();

    await expect(page.locator('.phonedry-tabs__tab[data-tab="actions"]'))
      .toHaveAttribute("aria-current", "page");

    const rows = page.locator(".phonedry-action__name");
    await expect(rows.first()).toBeVisible();

    const names = await rows.allInnerTexts();

    // The cleric carries four weapons and has one equipped. A greatsword at the
    // bottom of the pack is not an attack you can make this turn, and an
    // actions screen that lists it is how the screen fills with things that
    // are not actions.
    expect(names, "an equipped weapon is missing").toContain("Pistol");
    expect(names, "an unequipped weapon was listed").not.toContain("Shortsword");
    expect(names).not.toContain("Light Crossbow");

    // Channel Divinity is one item with three activities over one pool of uses.
    // Each gets its own row, which is what lets a tap do the thing instead of
    // opening a dialog to ask which was meant.
    expect(names).toContain("Turn Undead");
    expect(names).toContain("Divine Spark: Heal");

    // Spells stay on their own screen. The same tap in two places is the
    // duplication players complain about on other sheets.
    expect(names).not.toContain("Guiding Bolt");

    // The cleric carries two flasks of holy water, which are two items with a
    // charge each. They fold into one row carrying both charges — two identical
    // rows read as a bug and cost space a fight needs.
    const water = page.locator(".phonedry-action", { hasText: "Holy Water" });
    await expect(water).toHaveCount(1);
    await expect(water.locator(".phonedry-action__uses")).toHaveText("2/2");

    // The kind of thing each row is, said in a word as well as in the colour of
    // its stripe. A colour alone is a code the player has to learn.
    await expect(
      page.locator(".phonedry-action", { hasText: "Pistol" }).first().locator(".phonedry-action__type")
    ).not.toBeEmpty();

    const groups = await page.locator(".phonedry-section__heading").allInnerTexts();
    expect(groups[0], "actions should lead, in the order of a turn").toMatch(/action/i);

    // Uses come from the item even though the row is an activity, so all three
    // Channel Divinity rows read from the same pool.
    const turnUndead = page.locator(".phonedry-action", { hasText: "Turn Undead" });
    await expect(turnUndead.locator(".phonedry-action__uses")).toContainText("/");

    // An attack row carries the numbers a player checks before committing.
    const pistol = page.locator(".phonedry-action", { hasText: "Pistol" }).first();
    await expect(pistol.locator(".phonedry-action__tohit")).toContainText("+");
    await expect(pistol.locator(".phonedry-action__damage")).not.toBeEmpty();

    /* --- holding a row reads it rather than using it --- */

    // dnd5e gives an activity no description of its own — only a chat flavour
    // line, which is empty here — so the item's description is what there is to
    // read, and it is the right thing: it is the rules text for the feature.
    await expect(page.locator(".phonedry-describe")).toBeHidden();

    const held = await page.evaluate(() => game.messages.size);
    await longPress(page, turnUndead.locator(".phonedry-action__use"));

    await expect(page.locator(".phonedry-describe")).toBeVisible();
    await expect(page.locator(".phonedry-describe__body")).not.toBeEmpty();

    // A hold that also fired the tap would read the feature and spend a use of
    // it — the same failure the spells screen had to be protected from.
    expect(await page.evaluate(() => game.messages.size),
      "holding an action also used it").toBe(held);

    // Put it away before the next hold. The panel covers the screen, so a hold
    // aimed at a row underneath lands on the backdrop instead and reads
    // whatever was already open.
    await page.locator(".phonedry-describe__close").click();
    await expect(page.locator(".phonedry-describe")).toBeHidden();

    /* --- following a link inside a description --- */

    // Foundry answers a click on an enriched link by opening that document's
    // own sheet: a desktop application whose close control lands off the edge
    // of a phone screen, over a client whose sidebar we have suppressed. That
    // left no way back short of reloading, which is why the click is taken
    // before Foundry sees it.
    const radiance = page.locator(".phonedry-action", { hasText: "Radiance of the Dawn" });
    await longPress(page, radiance.locator(".phonedry-action__use"));

    const panel = page.locator(".phonedry-describe");
    await expect(panel).toBeVisible();
    await expect(page.locator(".phonedry-describe__name")).toHaveText("Radiance of the Dawn");

    const link = page.locator(".phonedry-describe__body a.content-link").first();
    await expect(link).toBeVisible();
    const linked = (await link.innerText()).trim();

    await link.click();

    // Opened in the same box rather than a window over the top of it.
    await expect(page.locator(".phonedry-describe__name")).toHaveText(linked);
    await expect(panel, "a Foundry document sheet was opened over the sheet")
      .toBeVisible();
    await expect(page.locator("#phonedry-shell .application.sheet")).toHaveCount(0);

    /* --- and backing out of it --- */

    // While there is something behind it, dismissing means going back: reading
    // a cited rule should not cost the rule it was cited from.
    await panel.click({ position: { x: 10, y: 10 } });
    await expect(page.locator(".phonedry-describe__name")).toHaveText("Radiance of the Dawn");
    await expect(panel).toBeVisible();

    // Only at the root does it actually close.
    await panel.click({ position: { x: 10, y: 10 } });
    await expect(panel).toBeHidden();

    /* --- an attack asks who first, and honours advantage --- */

    // dnd5e leaves a weapon's own target configuration empty — it does not
    // need one stated, because making an attack roll already implies a
    // target — so this is the one case `needsTargets` checks the activity's
    // own type for rather than reading it off the target block the way a
    // spell's is read.
    //
    // The stripe on the row is the same tint the header's rolls carry, so set
    // advantage first: this is the one row on the actions screen the mode
    // actually reaches.
    await page.locator('.phonedry-tabs__tab[data-tab="stats"]').click();
    await page.click("[data-action='setRollMode'][data-mode='advantage']");
    await page.locator('.phonedry-tabs__tab[data-tab="actions"]').click();

    const pistolUse = pistol.locator(".phonedry-action__use");
    await expect(pistolUse).toHaveClass(/phonedry-action__use--rollable/);

    await pistolUse.click();

    const picker = page.locator(".phonedry-targets");
    await expect(picker).toBeVisible();

    const targetRows = page.locator(".phonedry-target");
    await targetRows.first().click();
    await expect(targetRows.first()).toHaveAttribute("aria-pressed", "true");

    // The load-bearing assertion: the tap reaches the system. dnd5e posting a
    // chat card is the observable proof, and it is also what the roll log picks
    // up — the sidebar this module suppresses is where those normally land.
    const before = await page.evaluate(() => game.messages.size);
    await page.locator("[data-action='confirmTargets']").click();
    await expect(picker).toBeHidden();
    await page.waitForFunction(n => game.messages.size > n, before, { timeout: 10_000 });

    // dnd5e's own attack-roll dialog must never appear: `useActivity` calls
    // `rollAttack` directly with it suppressed, the same as every other roll
    // on the sheet. Left open, this is exactly the dialog a phone player has
    // no route back from, since Phonedry has no chat sidebar to find it in.
    await expect(page.locator("dialog.roll-configuration")).toHaveCount(0);

    // The attack roll itself carries advantage through — not just that a
    // message posted, but that the header's mode actually reached the roll
    // dnd5e made, the way it already does for every check and save.
    await expect.poll(() => page.evaluate(
      () => [...game.messages].at(-1)?.rolls?.[0]?.formula ?? ""
    ), { message: "the attack roll did not carry advantage" }).toMatch(/adv/);

    // Same proof the spells screen carries: the target actually reached
    // dnd5e's own card, not just the picker closing.
    await expect.poll(() => page.evaluate(
      () => [...game.messages].at(-1)?.getFlag("dnd5e", "targets")?.map(t => t.name) ?? []
    ), { message: "the chat card did not carry the chosen target" }).not.toEqual([]);

    expect(errors).toEqual([]);
    await context.close();
  });
});
