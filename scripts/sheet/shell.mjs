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
import { bindPressable } from "./gestures.mjs";
import {
  ROLL_MODE, promptRollMode, rollAbilityCheck, rollSavingThrow, rollSkill,
  rollDeathSave, rollInitiative
} from "../rolls.mjs";

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
      rollInitiative: PhonedryShell.#onRollInitiative
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
    content: { template: `modules/${MODULE_ID}/templates/parts/stats.hbs` }
  };

  /* -------------------------------------------- */

  /**
   * The actor currently displayed, or null if none could be resolved.
   * @type {Actor|null}
   */
  #actor = null;

  /** Removes the gesture listeners bound at the last render. @type {Function|null} */
  #unbindGestures = null;

  /** Hook registrations to clean up on close. @type {Array<[string, number]>} */
  #hooks = [];

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

    this.#bindGestures();
    this.#registerHooks();

    // Re-registering the same function reference for the same event is a no-op
    // per the DOM spec, so these do not stack up across renders.
    window.addEventListener("resize", this.#onViewportChange);
    window.addEventListener("orientationchange", this.#onViewportChange);
  }

  /**
   * Attach tap/hold handling to everything marked as rollable.
   *
   * Rebound on every render because a partial re-render replaces the element
   * the previous binding was attached to. The old binding is torn down first —
   * without that, a sheet that has re-rendered five times rolls five times per
   * tap, which is the kind of bug that only shows up after a long session.
   */
  #bindGestures() {
    this.#unbindGestures?.();
    this.#unbindGestures = bindPressable(this.element, "[data-roll]", {
      onTap: el => this.#roll(el, ROLL_MODE.NORMAL),
      onHold: async el => {
        const mode = await promptRollMode(el.dataset.rollLabel ?? el.textContent.trim());
        if ( mode ) this.#roll(el, mode);
      }
    });
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
  }

  /* -------------------------------------------- */

  /**
   * Dispatch a roll from a pressed element.
   *
   * The element carries what to roll in `data-roll` and `data-roll-key`, which
   * keeps the template declarative and means adding a roll type is a template
   * change plus one line here.
   *
   * @param {HTMLElement} el
   * @param {string} mode  A ROLL_MODE value.
   */
  #roll(el, mode) {
    if ( !this.#actor ) return;
    const { roll: type, rollKey: key } = el.dataset;

    switch ( type ) {
      case "check": return rollAbilityCheck(this.#actor, key, mode);
      case "save": return rollSavingThrow(this.#actor, key, mode);
      case "skill": return rollSkill(this.#actor, key, mode);
      case "death": return rollDeathSave(this.#actor, mode);
    }
  }

  /**
   * Initiative is a plain action rather than a pressable: it keeps dnd5e's own
   * dialog, so there is no advantage choice for a long press to offer.
   *
   * @this {PhonedryShell}
   */
  static #onRollInitiative() {
    if ( this.actor ) rollInitiative(this.actor);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onClose(options) {
    this.#unbindGestures?.();
    this.#unbindGestures = null;

    for ( const [hook, id] of this.#hooks ) Hooks.off(hook, id);
    this.#hooks = [];

    window.removeEventListener("resize", this.#onViewportChange);
    window.removeEventListener("orientationchange", this.#onViewportChange);
    super._onClose(options);
  }
}
