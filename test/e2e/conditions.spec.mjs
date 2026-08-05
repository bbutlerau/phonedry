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

    expect(errors).toEqual([]);
    await context.close();
  });
});
