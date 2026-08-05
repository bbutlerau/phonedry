import { test, expect, devices } from "@playwright/test";
import { joinGame, reloadAt, collectErrors, PHONE_VIEWPORT } from "./helpers/foundry.mjs";

/**
 * Stats screen smoke tests.
 *
 * The mapper is covered by unit tests, so what is left to prove here is the
 * part that cannot be tested without a real system attached: that a tap on a
 * row actually produces a dnd5e roll, with the right formula, in chat.
 *
 * That matters more than it might look. Phonedry deliberately suppresses
 * dnd5e's roll configuration dialog and states the advantage mode itself, which
 * means it is reaching into an API contract that could change under it. If
 * advantage ever silently stops being applied, the sheet would look perfectly
 * fine and quietly roll every check wrong — a chat card is the only place that
 * failure is visible.
 */

const TOUCH = { ...devices["iPhone 15"], viewport: undefined };

/** How long to hold for the long-press gesture; comfortably past HOLD_MS. */
const HOLD_MS = 700;

/**
 * Read the formula of the most recent chat message roll.
 *
 * @param {import("@playwright/test").Page} page
 */
function lastRollFormula(page) {
  return page.evaluate(() => {
    const message = [...game.messages].at(-1);
    return message?.rolls?.[0]?.formula ?? null;
  });
}

/**
 * Press and hold an element, then release.
 *
 * Playwright has no long-press primitive, so this drives the pointer directly.
 * The finger is not moved between down and up, because the gesture layer
 * cancels a hold that drifts — which is the behaviour that stops a dialog
 * appearing mid-scroll.
 *
 * @param {import("@playwright/test").Page} page
 * @param {import("@playwright/test").Locator} locator
 */
async function longPress(page, locator) {
  const box = await locator.boundingBox();
  const x = box.x + (box.width / 2);
  const y = box.y + (box.height / 2);

  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.waitForTimeout(HOLD_MS);
  await page.mouse.up();
}

test.describe("stats screen", () => {
  test("renders the assigned character's sheet", async ({ browser }) => {
    const context = await browser.newContext(TOUCH);
    const page = await context.newPage();
    const errors = collectErrors(page);

    await joinGame(page);
    await reloadAt(page, PHONE_VIEWPORT);

    // The empty state is a legitimate render, so asserting "something appeared"
    // would pass even if character resolution had broken entirely.
    await expect(page.locator(".phonedry-empty")).toHaveCount(0);
    await expect(page.locator(".phonedry-header__name")).not.toBeEmpty();

    // Six abilities and dnd5e's full skill list. Hard-coded because a count
    // derived from the page would agree with itself no matter what broke.
    await expect(page.locator(".phonedry-ability")).toHaveCount(6);
    await expect(page.locator(".phonedry-skill")).toHaveCount(18);

    await expect(page.locator(".phonedry-hp__value")).toContainText("/");
    expect(errors).toEqual([]);

    await context.close();
  });

  test("every roll control is big enough to hit with a finger", async ({ browser }) => {
    const context = await browser.newContext(TOUCH);
    const page = await context.newPage();

    await joinGame(page);
    await reloadAt(page, PHONE_VIEWPORT);

    // 44px is the floor the stylesheet sets, and it is easy to lose to a
    // grid or flex rule that shrinks a row without anyone noticing.
    const undersized = await page.locator("[data-roll]").evaluateAll(
      els => els
        .map(el => ({ label: el.dataset.rollLabel, height: el.getBoundingClientRect().height }))
        .filter(el => el.height < 44)
    );
    expect(undersized).toEqual([]);

    await context.close();
  });

  test("tapping a skill rolls it through dnd5e", async ({ browser }) => {
    const context = await browser.newContext(TOUCH);
    const page = await context.newPage();
    const errors = collectErrors(page);

    await joinGame(page);
    await reloadAt(page, PHONE_VIEWPORT);

    const before = await page.evaluate(() => game.messages.size);
    await page.locator('[data-roll="skill"][data-roll-key="ath"]').click();

    await expect.poll(() => page.evaluate(() => game.messages.size)).toBe(before + 1);

    // A single d20 — proof that the configuration dialog was suppressed rather
    // than silently defaulting to something else.
    expect(await lastRollFormula(page)).toMatch(/^1?d20/);

    // The card must come from dnd5e's own pipeline, not from a formula we
    // assembled: that is what keeps effects and third-party modules working.
    const flavour = await page.evaluate(() => [...game.messages].at(-1)?.flavor ?? "");
    expect(flavour).toContain("Athletics");

    expect(errors).toEqual([]);
    await context.close();
  });

  test("tapping an ability rolls a check, and its save button rolls a save", async ({ browser }) => {
    const context = await browser.newContext(TOUCH);
    const page = await context.newPage();

    await joinGame(page);
    await reloadAt(page, PHONE_VIEWPORT);

    await page.locator('[data-roll="check"][data-roll-key="wis"]').click();
    await expect.poll(
      () => page.evaluate(() => [...game.messages].at(-1)?.flavor ?? "")
    ).toContain("Check");

    // dnd5e labels these "<Ability> Ability Check" and "<Ability> Saving
    // Throw". Asserting on its wording rather than our own is the point: it
    // proves the card came out of the system's pipeline.
    await page.locator('[data-roll="save"][data-roll-key="wis"]').click();
    await expect.poll(
      () => page.evaluate(() => [...game.messages].at(-1)?.flavor ?? "")
    ).toContain("Saving Throw");

    await context.close();
  });

  test("holding a skill offers advantage, and choosing it changes the formula", async ({ browser }) => {
    const context = await browser.newContext(TOUCH);
    const page = await context.newPage();

    await joinGame(page);
    await reloadAt(page, PHONE_VIEWPORT);

    await longPress(page, page.locator('[data-roll="skill"][data-roll-key="ath"]'));

    const dialog = page.locator(".phonedry-roll-mode");
    await expect(dialog, "long press did not open the roll mode dialog").toBeVisible();

    // Exact, because "Advantage" is a substring of "Disadvantage".
    await dialog.getByRole("button", { name: "Advantage", exact: true }).click();

    // 2d20kh is what advantage looks like once dnd5e has built the roll. If
    // Phonedry's flags stopped reaching the system, this would come back as a
    // plain d20 while the interface still claimed advantage had been applied.
    await expect.poll(() => lastRollFormula(page)).toContain("2d20");

    await context.close();
  });

  test("a hit point change updates the header without a reload", async ({ browser }) => {
    const context = await browser.newContext(TOUCH);
    const page = await context.newPage();

    await joinGame(page);
    await reloadAt(page, PHONE_VIEWPORT);

    // Damage applied by the GM is the normal case, and a sheet that needed a
    // manual refresh to notice would be useless in a fight.
    const restore = await page.evaluate(async () => {
      const actor = game.modules.get("phonedry").api.shell.actor;
      const previous = actor.system.attributes.hp.value;
      await actor.update({ "system.attributes.hp.value": 1 });
      return previous;
    });

    await expect(page.locator(".phonedry-hp__value")).toContainText("1/");
    await expect(page.locator(".phonedry-hp")).toHaveClass(/phonedry-hp--down|phonedry-hp--bloodied/);

    await page.evaluate(hp => {
      const actor = game.modules.get("phonedry").api.shell.actor;
      return actor.update({ "system.attributes.hp.value": hp });
    }, restore);

    await context.close();
  });
});
