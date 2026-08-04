/**
 * The Phonedry shell.
 *
 * This is the single application that fills the screen once the tabletop has
 * been suppressed. In M1 it renders a status panel proving the boot path
 * worked; from M2 it becomes the frame the character sheet tabs live inside.
 *
 * It is deliberately frameless and unpositioned. Foundry's window chrome —
 * title bar, drag handles, resize corner — is meaningless on a phone, where
 * there is exactly one thing on screen and it occupies all of it.
 */

import { MODULE_ID, TABLET_BREAKPOINT } from "../constants.mjs";
import { isTabletViewport } from "../detect.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class PhonedryShell extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "phonedry-shell",
    classes: ["phonedry", "phonedry-shell"],
    tag: "section",
    window: {
      frame: false,
      positioned: false
    }
  };

  static PARTS = {
    body: {
      template: `modules/${MODULE_ID}/templates/shell.hbs`
    }
  };

  /* -------------------------------------------- */

  /**
   * The viewport width at the last render, used to tell a rotation apart from a
   * keyboard appearing. See `#onViewportChange`.
   * @type {number}
   */
  #lastWidth = window.innerWidth;

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
    const actor = game.user.character;

    return Object.assign(context, {
      userName: game.user.name,
      actorName: actor?.name ?? null,
      actorClass: actor ? this.#describeActor(actor) : null,
      foundryVersion: game.version,
      systemVersion: `${game.system.id} ${game.system.version}`,
      canvasDisabled: game.settings.get("core", "noCanvas"),
      isTablet: isTabletViewport(),
      viewport: `${window.innerWidth}×${window.innerHeight}`,
      breakpoint: TABLET_BREAKPOINT
    });
  }

  /* -------------------------------------------- */

  /**
   * A short "Level 5 Wizard" style summary of an actor.
   *
   * Reads dnd5e's own summary fields rather than deriving them, so multiclass
   * characters and anything the system computes stay correct without us
   * duplicating that logic.
   *
   * @param {Actor} actor
   * @returns {string|null}
   */
  #describeActor(actor) {
    const level = actor.system?.details?.level;
    const classes = Object.values(actor.classes ?? {})
      .map(cls => cls.name)
      .join(" / ");

    if ( !level && !classes ) return null;
    return [level ? `Level ${level}` : null, classes || null].filter(Boolean).join(" ");
  }

  /* -------------------------------------------- */

  /**
   * @inheritdoc
   *
   * This runs on every render, not just the first, but re-registering the same
   * function reference for the same event is a no-op per the DOM spec, so the
   * listeners do not stack up.
   */
  _onRender(context, options) {
    super._onRender(context, options);
    window.addEventListener("resize", this.#onViewportChange);
    window.addEventListener("orientationchange", this.#onViewportChange);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onClose(options) {
    window.removeEventListener("resize", this.#onViewportChange);
    window.removeEventListener("orientationchange", this.#onViewportChange);
    super._onClose(options);
  }
}
