import { test, expect, devices } from "@playwright/test";
import { joinGame, longPress, reloadAt, collectErrors, PHONE_VIEWPORT } from "./helpers/foundry.mjs";

/**
 * The conditions screen.
 *
 * The mapper is unit tested against plain objects. What needs a live world is
 * that toggling actually reaches core's status effect machinery — a condition
 * has to be recognised as *that* condition by dnd5e, the token HUD and every
 * other module, and an effect built by hand would look identical on screen
 * while being none of those things.
 */

const TOUCH = { ...devices["iPhone 15"], viewport: undefined };

test.describe("conditions", () => {
  test("toggling a condition reaches core, and exhaustion steps", async ({ browser }) => {
    const context = await browser.newContext(TOUCH);
    const page = await context.newPage();
    const errors = collectErrors(page);

    await joinGame(page);
    await reloadAt(page, PHONE_VIEWPORT);

    // Start from a known state. This test sets conditions, and a failure part
    // way through would otherwise leave them on and make the next run fail
    // somewhere unrelated.
    await page.evaluate(async () => {
      const actor = game.modules.get("phonedry").api.shell.actor;
      for ( const id of [...actor.statuses] ) await actor.toggleStatusEffect(id, { active: false });
      await actor.update({ "system.attributes.exhaustion": 0 });
    });

    await page.locator('.phonedry-tabs__tab[data-tab="conditions"]').click();

    const prone = page.locator('[data-action="toggleCondition"][data-condition="prone"]');
    await expect(prone).toHaveAttribute("aria-pressed", "false");

    // dnd5e marks some of its condition entries `pseudo` — internal markers
    // rather than conditions in the rules. Offering one would invite a player
    // to apply a rule that does not exist.
    await expect(page.locator('[data-condition="bleeding"]')).toHaveCount(0);

    /* --- toggling --- */

    await prone.click();

    // The load-bearing assertion. `statuses` is core's own reckoning, kept in
    // step with the effects on the actor, so this proves the condition was
    // created through the registered status rather than assembled by us.
    await expect.poll(() => page.evaluate(
      () => [...game.modules.get("phonedry").api.shell.actor.statuses]
    )).toContain("prone");

    await expect(prone).toHaveAttribute("aria-pressed", "true");

    await prone.click();
    await expect.poll(() => page.evaluate(
      () => [...game.modules.get("phonedry").api.shell.actor.statuses]
    )).not.toContain("prone");

    /* --- exhaustion is a level, not a switch --- */

    const exhaustion = page.locator('[data-action="stepExhaustion"]');
    await exhaustion.click();

    await expect.poll(() => page.evaluate(
      () => game.modules.get("phonedry").api.shell.actor.system.attributes.exhaustion
    )).toBe(1);

    // dnd5e derives the penalties from the level, so writing the number is the
    // whole of the work — and the status follows from it.
    await expect.poll(() => page.evaluate(
      () => [...game.modules.get("phonedry").api.shell.actor.statuses]
    )).toContain("exhaustion");

    /* --- holding reads the rule --- */

    await longPress(page, prone);
    await expect(page.locator(".phonedry-describe")).toBeVisible();
    await expect(page.locator(".phonedry-describe__name")).toHaveText("Prone");

    // A hold that also fired the tap would read the rule and apply the
    // condition at the same time.
    expect(await page.evaluate(
      () => [...game.modules.get("phonedry").api.shell.actor.statuses]
    ), "holding a condition also applied it").not.toContain("prone");

    /* --- the panel's layout survives having no artwork --- */

    // A rules page has no icon, and the head used to be a three-column grid: the
    // title dropped into the icon's column and the close button into the
    // flexible one, giving a squashed title and a stretched box on the left.
    const head = page.locator(".phonedry-describe__head");
    await expect(head.locator("img")).toHaveCount(0);

    const [titleBox, closeBox] = await Promise.all([
      head.locator(".phonedry-describe__titles").boundingBox(),
      head.locator(".phonedry-describe__close").boundingBox()
    ]);

    expect(closeBox.x, "the close button is not on the trailing edge")
      .toBeGreaterThan(titleBox.x);
    expect(titleBox.width, "the title was squeezed into the icon's column")
      .toBeGreaterThan(closeBox.width);

    /* --- and reading it does not dismiss it --- */

    // The backdrop closes the panel, and the description is inside it. Without
    // a guard the same action fires for taps on the text, and the panel shuts
    // the moment anyone tries to read or scroll it.
    await page.locator(".phonedry-describe__body").click();
    await expect(page.locator(".phonedry-describe")).toBeVisible();

    // Tapping the dimmed area above the panel dismisses it. The close button
    // sits mid-screen on a tall phone, so reaching past it is what a thumb does
    // first — and it is the standard sheet gesture on both platforms.
    await page.locator(".phonedry-describe").click({ position: { x: 10, y: 10 } });
    await expect(page.locator(".phonedry-describe")).toBeHidden();

    // The button still works for anyone who uses it.
    await longPress(page, prone);
    await expect(page.locator(".phonedry-describe")).toBeVisible();
    await page.locator(".phonedry-describe__close").click();
    await expect(page.locator(".phonedry-describe")).toBeHidden();

    // Put it back, so a rerun starts from the same state.
    await page.evaluate(async () => {
      const actor = game.modules.get("phonedry").api.shell.actor;
      await actor.update({ "system.attributes.exhaustion": 0 });
    });

    /* --- inspiration --- */

    const inspiration = page.locator("[data-action='toggleInspiration']");

    // Read the starting state rather than assuming it: this world is also the
    // one Brad tests on by hand.
    const inspired = await page.evaluate(() =>
      !!game.modules.get("phonedry").api.shell.actor.system.attributes.inspiration);
    await expect(inspiration).toHaveAttribute("aria-pressed", String(inspired));

    await inspiration.click();

    // dnd5e is what the write has to reach — the chip repainting itself proves
    // nothing.
    await expect.poll(() => page.evaluate(() =>
      !!game.modules.get("phonedry").api.shell.actor.system.attributes.inspiration))
      .toBe(!inspired);
    await expect(inspiration).toHaveAttribute("aria-pressed", String(!inspired));

    // Toggles both ways. A mis-tap on a phone would otherwise cost a player
    // their inspiration with no way back except asking the GM.
    await inspiration.click();
    await expect.poll(() => page.evaluate(() =>
      !!game.modules.get("phonedry").api.shell.actor.system.attributes.inspiration))
      .toBe(inspired);

    /*
     * The chip is the seventh in the vitals row, and the row is a grid that
     * wraps. Twice now a new readout has landed on a line of its own, stretched
     * across the full width, which reads as an error rather than as a layout —
     * so the claim is that they all sit on one line, not merely that the chip
     * exists.
     */
    const rows = await page.locator(".phonedry-vitals__item").evaluateAll(
      els => [...new Set(els.map(el => Math.round(el.getBoundingClientRect().top)))]
    );
    expect(rows, "the vitals row wrapped").toHaveLength(1);

    // And nothing spilled sideways to achieve it.
    expect(await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    )).toBeLessThanOrEqual(0);

    expect(errors).toEqual([]);
    await context.close();
  });

  test("concentration is surfaced, and can be saved for or dropped", async ({ browser }) => {
    const context = await browser.newContext(TOUCH);
    const page = await context.newPage();
    const errors = collectErrors(page);

    await joinGame(page);
    await reloadAt(page, PHONE_VIEWPORT);

    /*
     * Concentration is started through dnd5e rather than by building the effect
     * here, because the whole claim is that the sheet reads what the system
     * actually does. `Actor#beginConcentrating` is its own entry point, and it
     * is what casting a concentration spell calls.
     */
    const started = await page.evaluate(async () => {
      const actor = game.modules.get("phonedry").api.shell.actor;
      await actor.endConcentration();

      // Concentration is begun from an *activity*, not an item — the same unit
      // the actions screen is built on.
      const spell = actor.items.find(i => (i.type === "spell")
        && i.system.properties?.has?.("concentration")
        && i.system.activities?.contents?.length);
      if ( !spell ) return null;

      await actor.beginConcentrating(spell.system.activities.contents[0]);
      return spell.name;
    });

    // Skipped rather than failed where the character knows no concentration
    // spell: that is a fact about the world, not about the sheet.
    test.skip(!started, "the test character knows no concentration spell");

    await page.locator('.phonedry-tabs__tab[data-tab="conditions"]').click();

    /*
     * Its own section, above the conditions grid. Until now the concentration
     * effect appeared as one row among "Affecting you", named like everything
     * else and indistinguishable from a Bless someone else was maintaining —
     * which is how a spell stays running for an hour after it should have
     * ended.
     */
    const panel = page.locator(".phonedry-concentration");
    await expect(panel).toBeVisible();
    await expect(panel.locator(".phonedry-concentration__name")).toHaveText(started);

    // And exactly once. The concentration effect is not in dnd5e's
    // `conditionTypes`, so the filter that drops condition effects does not
    // catch it — without a filter of its own the spell appears in both places
    // under two different sets of controls.
    await expect(page.locator(".phonedry-effect", { hasText: started })).toHaveCount(0);

    // The save is the reason to come here, and it carries its own number.
    await expect(panel.locator(".phonedry-concentration__bonus")).toContainText(/[+-]/);

    /* --- rolling the save --- */

    const before = await page.evaluate(() => game.messages.size);
    await panel.locator(".phonedry-concentration__save").click();
    await page.waitForFunction(n => game.messages.size > n, before, { timeout: 10_000 });

    // Still concentrating: rolling the save does not decide the outcome, and a
    // sheet that dropped it on the roll would be inventing a rule.
    await expect(panel).toBeVisible();

    /* --- and dropping it --- */

    await panel.locator(".phonedry-concentration__end").click();

    // dnd5e's own route is what tells the spell, so the check is on the system
    // rather than on the section disappearing.
    await expect.poll(() => page.evaluate(() =>
      game.modules.get("phonedry").api.shell.actor.concentration.effects.size)).toBe(0);

    await expect(panel).toBeHidden();

    expect(errors).toEqual([]);
    await context.close();
  });
});
