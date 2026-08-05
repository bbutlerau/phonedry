import { test, expect, devices } from "@playwright/test";
import {
  joinGame, longPress, reloadAt, collectErrors, PHONE_VIEWPORT, LANDSCAPE_PHONE_VIEWPORT
} from "./helpers/foundry.mjs";

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


    /* --- tap targets, and no selectable text --- */


    // 44px is the floor the stylesheet sets, and it is easy to lose to a
    // grid or flex rule that shrinks a row without anyone noticing.
    const undersized = await page.locator("[data-roll]").evaluateAll(
      els => els
        .map(el => ({
          roll: `${el.dataset.roll}:${el.dataset.rollKey ?? ""}`,
          height: el.getBoundingClientRect().height
        }))
        .filter(el => el.height < 44)
    );
    expect(undersized).toEqual([]);
    // iOS turns a slow tap on a label into a text selection and a Copy /
    // Look Up callout over the sheet. This is the rule that prevents it, and
    // it cannot be verified anywhere but on the device — so the least this can
    // do is fail loudly if the rule is ever dropped.


    // Both spellings are checked because WebKit needs the prefixed one and does
    // not implement the standard property at all — `CSS.supports("user-select",
    // "none")` is false there. That is exactly why the stylesheet declares
    // both, and reading only the unprefixed name reports every row as
    // selectable on the one engine that matters most here.
    const selectable = await page.locator(".phonedry-skill__name").evaluateAll(
      els => els.filter(el => {
        const style = getComputedStyle(el);
        return (style.webkitUserSelect ?? style.userSelect) !== "none";
      }).length
    );
    expect(selectable).toBe(0);

    // The property is a proxy for the behaviour; this is the behaviour. If a
    // future engine drops the prefix, the check above could pass while text
    // stayed selectable.
    const selected = await page.evaluate(() => {
      const el = document.querySelector(".phonedry-skill__name");
      const range = document.createRange();
      range.selectNodeContents(el);
      const selection = getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      const text = selection.toString();
      selection.removeAllRanges();
      return text;
    });
    expect(selected, "skill labels can still be selected as text").toBe("");

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

    /* --- and the same for abilities --- */


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

    /* --- and holding a skill reads the rule instead of rolling it --- */

    // A skill is not an item, so there is no description to show: what a player
    // wants at the table is what the skill covers, which dnd5e keeps as a page
    // in its own reference compendium. Holding resolves that uuid rather than
    // anything the character owns.
    await expect(page.locator(".phonedry-describe")).toBeHidden();

    const held = await page.evaluate(() => game.messages.size);
    await longPress(page, page.locator('[data-roll="skill"][data-roll-key="ath"]'));

    await expect(page.locator(".phonedry-describe")).toBeVisible();
    await expect(page.locator(".phonedry-describe__name")).toHaveText("Athletics");
    await expect(page.locator(".phonedry-describe__body")).not.toBeEmpty();

    // A hold that also fired the tap would read the rule and roll the skill.
    expect(await page.evaluate(() => game.messages.size),
      "holding a skill also rolled it").toBe(held);

    await page.locator(".phonedry-describe__close").click();

    await context.close();
  });


  test("hit dice are visible and resting opens dnd5e's own dialog", async ({ browser }) => {
    const context = await browser.newContext(TOUCH);
    const page = await context.newPage();
    const errors = collectErrors(page);

    await joinGame(page);
    await reloadAt(page, PHONE_VIEWPORT);

    /* --- the pool a short rest spends --- */

    // Read against the actor rather than a hard-coded number, so this keeps
    // meaning something if the test character gains a level.
    const hd = await page.evaluate(() => {
      const { value, max } = game.modules.get("phonedry").api.shell.actor.system.attributes.hd;
      return { value, max };
    });

    await expect(page.locator(".phonedry-vitals__item", { hasText: /hit dice/i }))
      .toContainText(`${hd.value}/${hd.max}`);

    /* --- resting --- */

    await page.locator('[data-action="rest"][data-rest="short"]').click();

    // dnd5e's own dialog, not one of ours. Matched on its classes rather than
    // its title so this does not depend on the wording.
    const dialog = page.locator("dialog.application.rest.short-rest");
    await expect(dialog).toBeVisible();

    // The load-bearing assertion, and the reason this dialog is kept rather
    // than suppressed the way initiative's was: it is where hit dice are
    // actually spent. If a future change starts skipping it, spending hit dice
    // from a phone quietly stops being possible.
    await expect(dialog.locator("select")).toContainText(/d\d+/);

    // WebKit renders Foundry's dialogs with their content collapsed unless the
    // module's stylesheet intervenes. Playwright's WebKit does not reproduce
    // that, so this cannot prove the fix — but a dialog with no height at all
    // would be caught here rather than on someone's phone.
    const height = await dialog.evaluate(el => el.getBoundingClientRect().height);
    expect(height, "the rest dialog rendered with no height").toBeGreaterThan(200);

    // Closed rather than confirmed. Resting would spend the character's hit
    // dice and recover their slots, which the spells tests read.
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);

    expect(errors).toEqual([]);
    await context.close();
  });

  test("the advantage selector changes the formula of the next roll", async ({ browser }) => {
    const context = await browser.newContext(TOUCH);
    const page = await context.newPage();

    await joinGame(page);
    await reloadAt(page, PHONE_VIEWPORT);

    // Advantage used to live on a long press. It cannot: on iOS the system
    // claims the hold to select text and raises a Copy / Look Up callout over
    // the sheet, so the gesture is unreachable on half the target devices.
    await page.locator('[data-mode="advantage"]').click();
    await expect(page.locator("#phonedry-shell")).toHaveAttribute("data-roll-mode", "advantage");

    await page.locator('[data-roll="skill"][data-roll-key="ath"]').click();

    // 2d20kh is what advantage looks like once dnd5e has built the roll. If
    // Phonedry's flags stopped reaching the system, this would come back as a
    // plain d20 while the interface still claimed advantage had been applied.
    await expect.poll(() => lastRollFormula(page)).toContain("2d20");
    expect(await page.evaluate(
      () => [...game.messages].at(-1).rolls[0].terms[0].modifiers.join()
    )).toContain("adv");

    // Sticky, so a fight-long advantage is set once. The tint on every roll
    // control is what stops that becoming a silent trap.
    await page.locator('[data-roll="skill"][data-roll-key="ste"]').click();
    await expect.poll(() => lastRollFormula(page)).toContain("2d20");

    // Disadvantage is also two dice, so the formula alone cannot tell the two
    // apart — the die's own modifier is the only place they differ. dnd5e
    // tags them "adv" and "dis" rather than using kh/kl directly.
    await page.locator('[data-mode="disadvantage"]').click();
    await page.locator('[data-roll="skill"][data-roll-key="ath"]').click();
    await expect.poll(() => lastRollFormula(page)).toContain("2d20");
    expect(await page.evaluate(
      () => [...game.messages].at(-1).rolls[0].terms[0].modifiers.join()
    )).toContain("dis");

    await page.locator('[data-mode="normal"]').click();
    await page.locator('[data-roll="skill"][data-roll-key="ath"]').click();
    await expect.poll(() => lastRollFormula(page)).toMatch(/^1?d20/);

    await context.close();
  });

  test("hit points can be edited from the sheet", async ({ browser }) => {
    const context = await browser.newContext(TOUCH);
    const page = await context.newPage();
    const errors = collectErrors(page);

    await joinGame(page);
    await reloadAt(page, PHONE_VIEWPORT);

    const hp = () => page.evaluate(
      () => game.modules.get("phonedry").api.shell.actor.system.attributes.hp
    );

    // Start from a known state rather than from whatever the world happens to
    // be in. This test moves hit points around, and an earlier failure used to
    // leave the character part-way through — which then broke every later run
    // with an error that pointed at the wrong thing entirely.
    await page.evaluate(() => {
      const actor = game.modules.get("phonedry").api.shell.actor;
      return actor.update({
        "system.attributes.hp.value": actor.system.attributes.hp.max,
        "system.attributes.hp.temp": 0
      });
    });
    await expect.poll(async () => (await hp()).value).toBe((await hp()).max);

    const before = await hp();

    const editor = page.locator(".phonedry-hp-editor");
    await expect(editor).toBeHidden();

    // The whole bar is the target — the largest control on the sheet, for the
    // thing reached for most often mid-fight.
    await page.locator("[data-action='toggleHpEditor']").click();
    await expect(editor).toBeVisible();

    await page.locator(".phonedry-hp-editor__input").fill("7");
    await page.locator("[data-hp='damage']").click();
    await expect.poll(async () => (await hp()).value).toBe(before.value - 7);

    // The panel stays open and the amount clears: damage arrives in a run, but
    // rarely twice at the same size.
    await expect(editor).toBeVisible();
    await expect(page.locator(".phonedry-hp-editor__input")).toHaveValue("");
    await expect(page.locator(".phonedry-hp__value")).toContainText(`${before.value - 7}/`);

    await page.locator(".phonedry-hp-editor__input").fill("3");
    await page.locator("[data-hp='heal']").click();
    await expect.poll(async () => (await hp()).value).toBe(before.value - 4);

    // Healing stops at the maximum rather than running over it. dnd5e enforces
    // that, which is precisely why the arithmetic is delegated.
    await page.locator(".phonedry-hp-editor__input").fill("999");
    await page.locator("[data-hp='heal']").click();
    await expect.poll(async () => (await hp()).value).toBe(before.max);

    await page.locator(".phonedry-hp-editor__input").fill("5");
    await page.locator("[data-hp='temp']").click();
    await expect.poll(async () => (await hp()).temp).toBe(5);

    // Temporary hit points absorb damage before real ones do.
    await page.locator(".phonedry-hp-editor__input").fill("2");
    await page.locator("[data-hp='damage']").click();
    await expect.poll(async () => (await hp()).temp).toBe(3);
    expect((await hp()).value).toBe(before.max);

    // Restore, so the suite can be run repeatedly without drift.
    await page.evaluate(hp => game.modules.get("phonedry").api.shell.actor.update({
      "system.attributes.hp.value": hp.value,
      "system.attributes.hp.temp": hp.temp ?? 0
    }), before);

    expect(errors).toEqual([]);

    /* --- steppers, and a change from outside the sheet --- */

    // The editor is still open from above.
    const input = page.locator(".phonedry-hp-editor__input");
    await page.locator("[data-step='1']").click();
    await page.locator("[data-step='1']").click();
    await expect(input).toHaveValue("2");

    // Never negative: direction is the Damage or Heal button, so a negative
    // amount has nothing to mean.
    for ( let i = 0; i < 4; i++ ) await page.locator("[data-step='-1']").click();
    await expect(input).toHaveValue("0");


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


  test("initiative rolls without opening a Foundry dialog", async ({ browser }) => {
    const context = await browser.newContext(TOUCH);
    const page = await context.newPage();

    await joinGame(page);
    await reloadAt(page, PHONE_VIEWPORT);

    await page.locator("[data-action='rollInitiative']").click();

    // The load-bearing assertion. Foundry's own dialogs cannot be shown to a
    // player on a phone: every iOS browser is WebKit, and ApplicationV2 dialog
    // content collapses there — the roll dialog lost its formula and bonus
    // field, the same way the create-actor dialog loses most of its options in
    // desktop Safari. Nothing on this sheet may depend on one.
    await expect(page.locator(".roll-configuration")).toHaveCount(0);
    await expect(page.locator("dialog.application")).toHaveCount(0);

    // Proof it reached core's real initiative path rather than failing early:
    // a player cannot open an encounter, so with no combat running core warns
    // and stops. That warning is the observable end of the call.
    await expect.poll(
      () => page.evaluate(() => [...document.querySelectorAll("#notifications li")]
        .map(n => n.innerText).join(" "))
    ).toContain("Encounter");

    await context.close();
  });

  test("rolls are visible on the sheet, not only in a sidebar that is gone", async ({ browser }) => {
    const context = await browser.newContext(TOUCH);
    const page = await context.newPage();

    await joinGame(page);
    await reloadAt(page, PHONE_VIEWPORT);

    // The bar is present before anything is rolled — it is the way in to the
    // formula field — but it has no roll to show yet.
    await expect(page.locator(".phonedry-log")).toBeVisible();
    await expect(page.locator(".phonedry-log__total")).toHaveCount(0);

    await page.locator('[data-roll="skill"][data-roll-key="ath"]').click();

    const log = page.locator(".phonedry-log");
    await expect(log).toBeVisible();
    await expect(log.locator(".phonedry-log__flavor").first()).toContainText("Athletics");

    // The total shown must be the roll's own, not something recomputed here.
    const total = await page.evaluate(() => [...game.messages].at(-1).rolls[0].total);
    await expect(log.locator(".phonedry-log__total").first()).toHaveText(String(total));

    // An advantage roll shows both dice with the discarded one struck through.
    // Without that the roll looks like a single d20 disagreeing with its total.
    await page.locator('[data-mode="advantage"]').click();
    await page.locator('[data-roll="skill"][data-roll-key="ste"]').click();

    await expect.poll(
      () => log.locator(".phonedry-log__latest .phonedry-log__die").count()
    ).toBe(2);
    await expect(
      log.locator(".phonedry-log__latest .phonedry-log__die--dropped")
    ).toHaveCount(1);

    // The history is behind a tap, and holds the earlier roll.
    const history = page.locator(".phonedry-log__history");
    await expect(history).toBeHidden();
    await page.locator("[data-action='toggleRollLog']").click();
    await expect(history).toBeVisible();
    await expect(history.locator(".phonedry-log__entry")).toHaveCount(2);

    // Newest first: the top of a list is where the eye lands.
    await expect(history.locator(".phonedry-log__entry").first()).toContainText("Stealth");

    await page.locator('[data-mode="normal"]').click();
    await context.close();
  });

  test("a formula can be typed and rolled, like Foundry's /r", async ({ browser }) => {
    const context = await browser.newContext(TOUCH);
    const page = await context.newPage();
    const errors = collectErrors(page);

    await joinGame(page);
    await reloadAt(page, PHONE_VIEWPORT);
    await page.locator("[data-action='toggleRollLog']").click();

    const input = page.locator(".phonedry-log__formula-input");
    await input.fill("2d6 + 3");
    await page.locator("[data-action='rollTyped']").click();

    await expect.poll(
      () => page.evaluate(() => [...game.messages].at(-1)?.rolls?.[0]?.formula ?? null)
    ).toBe("2d6 + 3");

    // Attributed to the character, which is also what puts it in this sheet's
    // log rather than only in a chat nobody on a phone can see.
    const speaker = await page.evaluate(() => ({
      messageActor: [...game.messages].at(-1).speaker.actor,
      sheetActor: game.modules.get("phonedry").api.shell.actor.id
    }));
    expect(speaker.messageActor).toBe(speaker.sheetActor);
    await expect(page.locator(".phonedry-log__entry").first()).toContainText("2d6 + 3");

    // Kept, not cleared: a damage formula gets rolled every round, and
    // retyping it on a phone keyboard each time would be the whole cost of the
    // feature.
    await expect(input).toHaveValue("2d6 + 3");

    // Enter rolls too — the return key is already under the thumb after typing.
    const before = await page.evaluate(() => game.messages.size);
    await input.press("Enter");
    await expect.poll(() => page.evaluate(() => game.messages.size)).toBe(before + 1);

    // An actor reference resolves against the character rather than erroring.
    await input.fill("1d20 + @abilities.wis.mod");
    await page.locator("[data-action='rollTyped']").click();
    await expect.poll(
      () => page.evaluate(() => [...game.messages].at(-1)?.rolls?.[0]?.formula ?? null)
    ).toBe("1d20 + 4");

    expect(errors).toEqual([]);

    /* --- and one that cannot be rolled --- */

    // The log is still open from above.
    const beforeInvalid = await page.evaluate(() => game.messages.size);
    await page.locator(".phonedry-log__formula-input").fill("not a formula");
    await page.locator("[data-action='rollTyped']").click();

    // Foundry's own error here is "Unresolved StringTerm not requested for
    // evaluation", which tells a player nothing at all.
    await expect.poll(
      () => page.evaluate(() => [...document.querySelectorAll("#notifications li")]
        .map(n => n.innerText).join(" "))
    ).toContain("2d6 + 3");

    expect(await page.evaluate(() => game.messages.size)).toBe(beforeInvalid);

    await context.close();
  });


  test("a phone on its side asks to be turned back", async ({ browser }) => {
    const context = await browser.newContext(TOUCH);
    const page = await context.newPage();

    await joinGame(page);
    await reloadAt(page, LANDSCAPE_PHONE_VIEWPORT);

    await expect(page.locator(".phonedry-rotate")).toBeVisible();

    // Hidden, not merely covered: a tap that lands on a roll button behind the
    // prompt would roll it.
    await expect(page.locator(".phonedry-content")).toBeHidden();
    await expect(page.locator(".phonedry-header")).toBeHidden();

    // The reason this needs its own test rather than a media query anyone can
    // read: at 852px wide a landscape phone is past the 768px tablet
    // breakpoint, and was being handed the tablet layout on a 393px-tall
    // screen. The height condition is what a width-only rule misses.
    const isTablet = await page.evaluate(() => game.modules.get("phonedry").api.shell !== null
      && window.matchMedia("(min-width: 768px) and (min-height: 600px)").matches);
    expect(isTablet, "landscape phone still matched the tablet layout").toBe(false);

    await context.close();
  });


});
