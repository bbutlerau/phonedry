/**
 * The Phonedry shell.
 *
 * This is the single application that fills the screen once the tabletop has
 * been suppressed. It owns the character sheet: resolving whose sheet to show,
 * turning that actor into a view model, and translating taps into rolls.
 *
 * It is deliberately frameless and unpositioned. Foundry's window chrome —
 * title bar, drag handles, resize corner — is meaningless on a phone, where
 * there is exactly one thing on screen and it occupies all of it.
 */

import { MODULE_ID } from "../constants.mjs";
import { isTabletViewport } from "../detect.mjs";
import { resolveCharacter } from "../data/character.mjs";
import { buildStatsView } from "../data/stats.mjs";
import {
  ROLL_MODE, rollAbilityCheck, rollSavingThrow, rollSkill,
  rollDeathSave, rollInitiative, rollTypedCommand
} from "../rolls.mjs";
import { applyDamage, applyHealing, applyTempHP, parseAmount } from "../hp.mjs";
import { describeRoll, isOwnRoll, pushRoll } from "../data/roll-log.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class PhonedryShell extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "phonedry-shell",
    classes: ["phonedry", "phonedry-shell"],
    tag: "section",
    window: {
      frame: false,
      positioned: false
    },
    actions: {
      applyHp: PhonedryShell.#onApplyHp,
      roll: PhonedryShell.#onRoll,
      rollTyped: PhonedryShell.#onRollTyped,
      rollInitiative: PhonedryShell.#onRollInitiative,
      setRollMode: PhonedryShell.#onSetRollMode,
      stepHp: PhonedryShell.#onStepHp,
      toggleHpEditor: PhonedryShell.#onToggleHpEditor,
      toggleRollLog: PhonedryShell.#onToggleRollLog
    }
  };

  /**
   * Two parts, each rendering exactly one top-level element.
   *
   * That constraint is core's, not ours: `#parsePartHTML` throws unless a part
   * produces a single root element, and the throw happens inside the render
   * promise — so on a canvas-free client it presents as a blank screen with no
   * error, which is precisely how M1 failed. Each template here carries a
   * comment saying so.
   *
   * Splitting header from content is also what makes a hit point change cheap:
   * `render({ parts: ["header"] })` leaves the skills list untouched instead of
   * rebuilding several dozen rows on a phone GPU.
   */
  static PARTS = {
    header: { template: `modules/${MODULE_ID}/templates/parts/header.hbs` },
    content: { template: `modules/${MODULE_ID}/templates/parts/stats.hbs` },

    // Below the content, because it sits at the bottom of the screen where a
    // thumb is. Its own part so a roll can refresh it without rebuilding the
    // skills list.
    log: { template: `modules/${MODULE_ID}/templates/parts/roll-log.hbs` },

    // Always rendered, shown only by a media query. Whether a phone is being
    // held sideways is not something the shell should have to track.
    rotate: { template: `modules/${MODULE_ID}/templates/parts/rotate.hbs` }
  };

  /* -------------------------------------------- */

  /**
   * The actor currently displayed, or null if none could be resolved.
   * @type {Actor|null}
   */
  #actor = null;

  /** Hook registrations to clean up on close. @type {Array<[string, number]>} */
  #hooks = [];

  /**
   * How the next roll will be made.
   *
   * Sticky: it stays where the player put it rather than resetting after each
   * roll, because advantage usually comes from something that lasts a whole
   * fight — a spell, a condition, a flanking position — and re-selecting it
   * before every attack would be worse than the problem it solves. The cost is
   * that a forgotten mode skews later rolls, which is why the indicator is
   * deliberately impossible to miss rather than tasteful.
   *
   * Not persisted. A session starting on anything other than a straight roll
   * would be a genuine trap, since nobody would remember setting it.
   *
   * @type {string}
   */
  #rollMode = ROLL_MODE.NORMAL;

  /** The current roll mode. Exposed for the smoke tests and the console. */
  get rollMode() {
    return this.#rollMode;
  }

  /**
   * Whether the hit point editor is showing.
   *
   * Kept here rather than read back off the DOM because a re-render replaces
   * the DOM, and hit points are exactly what re-renders the header — so the
   * panel would close itself the moment it was used.
   *
   * @type {boolean}
   */
  #hpEditorOpen = false;

  /**
   * Recent rolls, newest first.
   *
   * Held in memory only. A roll log that survived a reload would be showing
   * results from a session that ended days ago, which is worse than showing
   * nothing — and the authoritative record is chat, which loses nothing.
   *
   * @type {object[]}
   */
  #rollLog = [];

  /** Whether the roll history is expanded. @type {boolean} */
  #rollLogOpen = false;

  /**
   * What is currently typed in the formula field.
   *
   * Mirrored here so a re-render does not wipe it — and deliberately not
   * cleared after rolling, because the same formula usually gets rolled again:
   * a weapon's damage comes up every round.
   *
   * @type {string}
   */
  #formula = "";

  /** The roll log. Exposed for the smoke tests and the console. */
  get rollLog() {
    return this.#rollLog;
  }

  /**
   * The viewport width at the last render, used to tell a rotation apart from a
   * keyboard appearing. See `#onViewportChange`.
   * @type {number}
   */
  #lastWidth = window.innerWidth;

  /** The actor being shown. Exposed for the smoke tests and the console. */
  get actor() {
    return this.#actor;
  }

  /* -------------------------------------------- */

  /**
   * Re-render on viewport changes so the layout can follow a rotation.
   *
   * Width, not height, is the trigger — and that distinction matters on
   * Android. Chrome and Samsung Internet resize the viewport when the on-screen
   * keyboard opens, so a height-sensitive listener would re-render the sheet
   * underneath someone the moment they tapped an input, destroying the field
   * they were typing into. iOS does not resize for the keyboard, so this bug
   * would never have shown up on the iPad.
   *
   * Rotation always changes the width, so nothing real is missed by ignoring
   * height.
   *
   * Bound once and kept as a field so it can be removed again in `_onClose`;
   * an anonymous listener here would leak for the lifetime of the page.
   */
  /**
   * Keep the typed formula in sync with the field.
   *
   * Without this, any re-render — someone else's roll landing in the log, the
   * GM applying damage — would rebuild the field from stale state and discard
   * what was being typed.
   */
  #onFormulaInput = event => {
    if ( event.target.classList.contains("phonedry-log__formula-input") ) {
      this.#formula = event.target.value;
    }
  };

  /**
   * Roll on Enter.
   *
   * Phone keyboards put a return key right where the thumb already is, and
   * reaching for a separate button after typing is a wasted movement. The
   * button stays for anyone using the keypad's arrows or a tablet keyboard.
   */
  #onFormulaKey = event => {
    if ( (event.key !== "Enter") ) return;
    if ( !event.target.classList.contains("phonedry-log__formula-input") ) return;

    event.preventDefault();
    PhonedryShell.#onRollTyped.call(this);
  };

  #onViewportChange = foundry.utils.debounce(() => {
    if ( window.innerWidth === this.#lastWidth ) return;
    this.#lastWidth = window.innerWidth;
    this.render();
  }, 150);

  /* -------------------------------------------- */

  /** @inheritdoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const { actor, reason, candidates } = resolveCharacter(game.user);
    this.#actor = actor;

    return Object.assign(context, {
      isTablet: isTabletViewport(),
      actor,
      rollMode: this.#rollMode,
      rollLog: this.#rollLog,
      rollLogOpen: this.#rollLogOpen,
      formula: this.#formula,

      // The view model, or null. The template branches on this rather than on
      // the actor, so an actor that somehow fails to map still lands on the
      // empty state instead of throwing inside Handlebars.
      stats: actor ? buildStatsView(actor, CONFIG.DND5E) : null,

      empty: actor ? null : {
        reason,
        userName: game.user.name,
        candidates: candidates.map(a => ({ id: a.id, name: a.name }))
      }
    });
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onRender(context, options) {
    super._onRender(context, options);

    this.#applyRollMode();
    this.#applyHpEditorState();
    this.#registerHooks();

    // Bound to the application root rather than to the field, because the field
    // is replaced on every log re-render while the root is not. Re-adding the
    // same function reference is a no-op, so these do not stack up.
    this.element.addEventListener("input", this.#onFormulaInput);
    this.element.addEventListener("keydown", this.#onFormulaKey);

    // Re-registering the same function reference for the same event is a no-op
    // per the DOM spec, so these do not stack up across renders.
    window.addEventListener("resize", this.#onViewportChange);
    window.addEventListener("orientationchange", this.#onViewportChange);
  }

  /**
   * Reflect the current roll mode in the DOM.
   *
   * The mode lives on the root element as a data attribute, which lets CSS tint
   * every roll control at once without the shell knowing which controls exist.
   * That matters as the sheet grows: spells and weapons in later milestones get
   * the same treatment for free.
   *
   * Called on every render as well as on change, because a partial re-render
   * rebuilds the buttons and would otherwise lose their pressed state.
   */
  #applyRollMode() {
    this.element.dataset.rollMode = this.#rollMode;

    for ( const button of this.element.querySelectorAll("[data-action='setRollMode']") ) {
      button.setAttribute("aria-pressed", String(button.dataset.mode === this.#rollMode));
    }
  }

  /**
   * Show or hide the hit point editor to match the stored state.
   *
   * Also runs after every render, which is what keeps the panel open across the
   * re-render that applying damage causes — otherwise taking damage twice in a
   * row would mean reopening the panel in between.
   */
  #applyHpEditorState() {
    const editor = this.element.querySelector(".phonedry-hp-editor");
    const toggle = this.element.querySelector("[data-action='toggleHpEditor']");
    if ( !editor || !toggle ) return;

    editor.hidden = !this.#hpEditorOpen;
    toggle.setAttribute("aria-expanded", String(this.#hpEditorOpen));
  }

  /**
   * The hit point editor's amount field.
   * @returns {HTMLInputElement|null}
   */
  get #hpInput() {
    return this.element.querySelector(".phonedry-hp-editor__input");
  }


  /**
   * Keep the sheet in step with the actor.
   *
   * Three document types matter, and it is worth being explicit about why the
   * obvious one is not enough. `updateActor` covers hit points and death saves;
   * item changes cover equipping armour, which moves AC; and active effects
   * cover a bless or a bane, which move skills and saves without touching
   * either. A sheet that only watched the actor would show a stale armour class
   * for the length of a fight.
   */
  #registerHooks() {
    if ( this.#hooks.length ) return;

    const refresh = doc => {
      if ( !this.#actor ) return;

      // Items and effects report their owning actor through `parent`; an effect
      // living on an item is one level deeper again.
      const actor = (doc instanceof Actor) ? doc
        : (doc.parent instanceof Actor) ? doc.parent
          : doc.parent?.parent;

      if ( actor?.id === this.#actor.id ) this.render();
    };

    for ( const hook of ["updateActor", "createItem", "updateItem", "deleteItem",
      "createActiveEffect", "updateActiveEffect", "deleteActiveEffect"] ) {
      this.#hooks.push([hook, Hooks.on(hook, refresh)]);
    }

    /*
     * Rolls arrive as chat messages, which is the only place Foundry reports
     * them — and chat lives in the sidebar this module suppresses. Without
     * this, every roll the sheet makes is correct and invisible.
     */
    this.#hooks.push(["createChatMessage", Hooks.on("createChatMessage", message => {
      if ( !isOwnRoll(message, { userId: game.user.id, actorId: this.#actor?.id }) ) return;

      const entry = describeRoll(message);
      if ( !entry ) return;

      this.#rollLog = pushRoll(this.#rollLog, entry);

      // Only the log is re-rendered. A roll changes nothing about the abilities
      // or skills, and rebuilding them on every d20 would make the sheet stutter
      // through a combat round.
      this.render({ parts: ["log"] });
    })]);
  }

  /* -------------------------------------------- */

  /**
   * Dispatch a roll from a tapped control.
   *
   * The element carries what to roll in `data-roll` and `data-roll-key`, which
   * keeps the template declarative and means adding a roll type is a template
   * change plus one line here.
   *
   * @this {PhonedryShell}
   * @param {PointerEvent} event
   * @param {HTMLElement} target  The element carrying `data-action`.
   */
  static #onRoll(event, target) {
    if ( !this.actor ) return;
    const { roll: type, rollKey: key } = target.dataset;
    const mode = this.rollMode;

    switch ( type ) {
      case "check": return rollAbilityCheck(this.actor, key, mode);
      case "save": return rollSavingThrow(this.actor, key, mode);
      case "skill": return rollSkill(this.actor, key, mode);
      case "death": return rollDeathSave(this.actor, mode);
    }
  }

  /**
   * Change how the next roll will be made.
   *
   * Applied directly to the DOM rather than through a re-render: the feedback
   * has to be immediate, and rebuilding the header to flip two attributes would
   * be both slower and more code.
   *
   * @this {PhonedryShell}
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static #onSetRollMode(event, target) {
    this.#rollMode = target.dataset.mode;
    this.#applyRollMode();
  }

  /**
   * Initiative keeps dnd5e's own dialog, because it is the only entry point
   * that places the actor into the combat tracker correctly. The sheet's roll
   * mode is handed to it so the dialog opens on the setting the player already
   * chose rather than contradicting the header.
   *
   * @this {PhonedryShell}
   */
  static #onRollInitiative() {
    if ( this.actor ) rollInitiative(this.actor, this.rollMode);
  }

  /* -------------------------------------------- */

  /**
   * Open or close the hit point editor.
   *
   * Focus moves to the amount field on opening, which saves a second tap. It is
   * deliberately not done on a re-render — pulling focus while someone is
   * reading their sheet would raise the keyboard unbidden.
   *
   * @this {PhonedryShell}
   */
  static #onToggleHpEditor() {
    this.#hpEditorOpen = !this.#hpEditorOpen;
    this.#applyHpEditorState();
    if ( this.#hpEditorOpen ) this.#hpInput?.focus();
  }

  /**
   * Nudge the amount by one.
   *
   * Worth having alongside the keyboard: a single point of damage or healing is
   * common enough, and these are two taps with no keyboard at all.
   *
   * @this {PhonedryShell}
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static #onStepHp(event, target) {
    const input = this.#hpInput;
    if ( !input ) return;

    const next = (Number.parseInt(input.value, 10) || 0) + Number(target.dataset.step);

    // Never below zero. Direction is chosen by the Damage or Heal button, so a
    // negative amount here has no meaning to express.
    input.value = String(Math.max(0, next));
  }

  /**
   * Apply the typed amount as damage, healing or temporary hit points.
   *
   * @this {PhonedryShell}
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static async #onApplyHp(event, target) {
    const input = this.#hpInput;
    if ( !this.actor || !input ) return;

    const amount = parseAmount(input.value);
    if ( amount === null ) {
      ui.notifications?.warn(game.i18n.localize("PHONEDRY.HitPoints.NeedAmount"));
      input.focus();
      return;
    }

    switch ( target.dataset.hp ) {
      case "damage": await applyDamage(this.actor, amount); break;
      case "heal": await applyHealing(this.actor, amount); break;
      case "temp": await applyTempHP(this.actor, amount); break;
      default: return;
    }

    // Clearing rather than keeping the amount: the next change is rarely the
    // same size, and a stale number left in the field is a mis-tap waiting to
    // happen. The panel stays open, because damage tends to arrive in a run.
    const cleared = this.#hpInput;
    if ( cleared ) cleared.value = "";
  }

  /**
   * Roll whatever is typed in the formula field.
   *
   * The field is not cleared afterwards. A damage formula gets rolled every
   * round, so keeping it means the next roll is one tap rather than retyping
   * "2d6 + 3" on a phone keyboard.
   *
   * @this {PhonedryShell}
   */
  static async #onRollTyped() {
    if ( !this.actor ) return;
    await rollTypedCommand(this.actor, this.#formula);
  }

  /**
   * Show or hide the roll history.
   *
   * Re-rendered rather than toggled in the DOM, because the bar itself changes
   * with the state: it shows the most recent roll while collapsed and a heading
   * while open, so that the list underneath does not repeat it. Only the log
   * part is rebuilt.
   *
   * @this {PhonedryShell}
   */
  static #onToggleRollLog() {
    this.#rollLogOpen = !this.#rollLogOpen;
    this.render({ parts: ["log"] });
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onClose(options) {
    this.element.removeEventListener("input", this.#onFormulaInput);
    this.element.removeEventListener("keydown", this.#onFormulaKey);

    for ( const [hook, id] of this.#hooks ) Hooks.off(hook, id);
    this.#hooks = [];

    window.removeEventListener("resize", this.#onViewportChange);
    window.removeEventListener("orientationchange", this.#onViewportChange);
    super._onClose(options);
  }
}
