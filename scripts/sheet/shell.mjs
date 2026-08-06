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

import { MODULE_ID, TABS, DEFAULT_TAB } from "../constants.mjs";
import { isTabletViewport } from "../detect.mjs";
import { resolveCharacter } from "../data/character.mjs";
import { buildStatsView } from "../data/stats.mjs";
import { buildFeaturesView } from "../data/features.mjs";
import { buildSpellsView } from "../data/spells.mjs";
import { buildActionsView } from "../data/actions.mjs";
import { buildConditionsView } from "../data/conditions.mjs";
import { buildInventoryView } from "../data/inventory.mjs";
import {
  endConcentration, setCondition, setEffectDisabled, setExhaustion, setInspiration
} from "../conditions.mjs";
import { setAttuned, setEquipped } from "../inventory.mjs";
import { takeRest } from "../rest.mjs";
import { findActivity, useActivity } from "../actions.mjs";
import { castSpell, setPrepared } from "../spells.mjs";
import { buildTargetsView, needsTargets } from "../data/targets.mjs";
import { broadcastTargets, collectCandidates, targetDescriptors } from "../targets.mjs";
import { addSpell, getAvailableSpells, ownedSpellIds } from "../spell-browser.mjs";
import { searchSpells, SORTS } from "../data/spell-browser.mjs";
import { addItem, getAvailableItems } from "../item-browser.mjs";
import { searchItems, ITEM_SORTS } from "../data/item-browser.mjs";
import {
  ROLL_MODE, rollAbilityCheck, rollSavingThrow, rollSkill,
  rollConcentration, rollDeathSave, rollInitiative, rollToolCheck, rollTypedCommand
} from "../rolls.mjs";
import { applyDamage, applyHealing, applyTempHP, parseAmount } from "../hp.mjs";
import { describeRoll, isOwnRoll, pushRoll } from "../data/roll-log.mjs";
import { describeDocument, resolveDescribable } from "../describe.mjs";
import { bindLongPress } from "./gestures.mjs";

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
      addFromBrowser: PhonedryShell.#onAddFromBrowser,
      applyHp: PhonedryShell.#onApplyHp,
      castSpell: PhonedryShell.#onCastSpell,
      rest: PhonedryShell.#onRest,
      roll: PhonedryShell.#onRoll,
      rollTyped: PhonedryShell.#onRollTyped,
      rollInitiative: PhonedryShell.#onRollInitiative,
      closeDescription: PhonedryShell.#onCloseDescription,
      describeItem: PhonedryShell.#onDescribeItem,
      toggleEquipped: PhonedryShell.#onToggleEquipped,
      toggleAttuned: PhonedryShell.#onToggleAttuned,
      logOut: PhonedryShell.#onLogOut,
      closeBrowser: PhonedryShell.#onCloseBrowser,
      closeSwitcher: PhonedryShell.#onCloseSwitcher,
      switchCharacter: PhonedryShell.#onSwitchCharacter,
      closeTargets: PhonedryShell.#onCloseTargets,
      confirmTargets: PhonedryShell.#onConfirmTargets,
      toggleTarget: PhonedryShell.#onToggleTarget,
      openBrowser: PhonedryShell.#onOpenBrowser,
      setRollMode: PhonedryShell.#onSetRollMode,
      setBrowserSort: PhonedryShell.#onSetBrowserSort,
      setTab: PhonedryShell.#onSetTab,
      stepExhaustion: PhonedryShell.#onStepExhaustion,
      toggleCondition: PhonedryShell.#onToggleCondition,
      toggleInspiration: PhonedryShell.#onToggleInspiration,
      rollConcentration: PhonedryShell.#onRollConcentration,
      endConcentration: PhonedryShell.#onEndConcentration,
      toggleEffect: PhonedryShell.#onToggleEffect,
      stepHp: PhonedryShell.#onStepHp,
      toggleHpEditor: PhonedryShell.#onToggleHpEditor,
      togglePrepared: PhonedryShell.#onTogglePrepared,
      toggleRollLog: PhonedryShell.#onToggleRollLog,
      useActivity: PhonedryShell.#onUseActivity
    }
  };

  /**
   * Each part renders exactly one top-level element.
   *
   * That constraint is core's, not ours: `#parsePartHTML` throws unless a part
   * produces a single root element, and the throw happens inside the render
   * promise — so on a canvas-free client it presents as a blank screen with no
   * error, which is precisely how M1 failed. Each template here carries a
   * comment saying so.
   *
   * Splitting them up is also what keeps re-renders cheap: a hit point change
   * rebuilds the header alone, a roll rebuilds the log alone, and neither
   * touches a list of several dozen rows on a phone GPU.
   */
  static PARTS = {
    header: { template: `modules/${MODULE_ID}/templates/parts/header.hbs` },

    // One content part for every tab. The active tab's body is included as a
    // dynamic partial, so only the visible section is built — rendering a full
    // spell list behind the skills screen would cost a phone real time.
    //
    // `scrollable` is core's own scroll preservation, and it is load-bearing
    // rather than a nicety. Preparing a spell updates the item, which re-renders
    // the sheet; without this the list jumps back to the top, so a player
    // preparing several spells is thrown to the top of the list after each one
    // — and the further down the list they are working, the worse it gets.
    // The empty selector means the part's own root element, which is the
    // scrolling container here.
    content: {
      template: `modules/${MODULE_ID}/templates/parts/content.hbs`,
      scrollable: [""]
    },

    // Below the content, because it sits at the bottom of the screen where a
    // thumb is. Its own part so a roll can refresh it without rebuilding the
    // skills list.
    log: { template: `modules/${MODULE_ID}/templates/parts/roll-log.hbs` },

    // Below the log, at the very bottom, where a thumb rests.
    tabs: { template: `modules/${MODULE_ID}/templates/parts/tabs.hbs` },

    // A full-screen overlay, hidden until asked for.
    // Same again for the results list, which re-renders on every keystroke and
    // whenever a spell is added from it.
    browser: {
      template: `modules/${MODULE_ID}/templates/parts/browser.hbs`,
      scrollable: [".phonedry-browser__results"]
    },

    // Who a spell is aimed at, opened by casting one that wants targets.
    targets: { template: `modules/${MODULE_ID}/templates/parts/targets.hbs` },

    // What something is, opened by holding it.
    describe: { template: `modules/${MODULE_ID}/templates/parts/describe.hbs` },

    // Which of the player's own characters is showing, opened by holding the
    // portrait or name in the header.
    switcher: { template: `modules/${MODULE_ID}/templates/parts/switcher.hbs` },

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

  /**
   * Which section is showing.
   *
   * Not persisted: a session starts on the stats screen, which is where a
   * player looks first, and restoring a tab from three days ago would be more
   * surprising than useful.
   *
   * @type {string}
   */
  #tab = DEFAULT_TAB;

  /** The active tab. Exposed for the smoke tests and the console. */
  get tab() {
    return this.#tab;
  }

  /** Whether the roll history is expanded. @type {boolean} */
  #rollLogOpen = false;

  /**
   * Which compendium browser is open, or null when none is.
   *
   * One panel serves both — spells from the spells screen, gear from the
   * inventory screen — because they differ only in where their entries come
   * from and what a row says. A second copy would be a second search field,
   * debounce, result cap and focus dance to keep in step with this one.
   *
   * @type {"spells"|"items"|null}
   */
  #browserMode = null;

  /** The open browser. Exposed for the smoke tests and the console. */
  get browserMode() {
    return this.#browserMode;
  }

  /** What is typed in the search field. @type {string} */
  #browserQuery = "";

  /**
   * How each browser's results are ordered, kept per browser.
   *
   * Shared state would mean opening the gear browser after sorting spells by
   * level left it on an order it does not have.
   *
   * @type {Record<string, string>}
   */
  #browserSort = { spells: SORTS.NAME, items: ITEM_SORTS.NAME };

  /**
   * The description panel's contents, or null when it is closed.
   *
   * Held rather than derived, because enriching the HTML is asynchronous and a
   * template cannot wait: the hold resolves it, stores it, then re-renders.
   *
   * @type {object|null}
   */
  #describe = null;

  /**
   * Panels behind the current one, oldest first.
   *
   * A description is full of links to other rules — Radiance of the Dawn cites
   * Darkness, which cites its own references — and following one has to be
   * reversible or the player loses the thing they were reading. Kept as a stack
   * rather than a single previous entry, because those chains run several deep.
   *
   * @type {object[]}
   */
  #describeStack = [];

  /**
   * What is waiting on a target choice, or null when the picker is closed.
   *
   * Two shapes rather than one, because the two callers finish differently. A
   * spell is cast through `Item#use`, which lets dnd5e resolve which of the
   * spell's own activities actually runs — the same as it would from the
   * spells screen — so only the item is kept. An activity reached from the
   * actions screen already named which one to run when its row was tapped, and
   * finishing it means calling that exact activity rather than asking dnd5e to
   * pick again.
   *
   * @type {{kind: "spell", item: Item}|{kind: "activity", activity: object}|null}
   */
  #targeting = null;

  /** Who is available to aim at, captured when the picker opened. @type {object[]} */
  #candidates = [];

  /** Chosen target ids. @type {Set<string>} */
  #selectedTargets = new Set();

  /** Removes the long-press listeners bound at the last render. @type {Function|null} */
  #unbindLongPress = null;

  /** Removes the character-switch long-press listener bound at the last render. @type {Function|null} */
  #unbindCharacterSwitch = null;

  /**
   * Whether the character switcher panel is showing.
   *
   * A player with only one owned character never has anywhere to switch to,
   * but the hold still opens the panel — it says so rather than doing nothing,
   * which would read as the gesture having failed rather than as there being
   * nothing behind it.
   *
   * @type {boolean}
   */
  #switcherOpen = false;

  /** Whether the character switcher is open. Exposed for the smoke tests. */
  get switcherOpen() {
    return this.#switcherOpen;
  }

  /**
   * Compendium index entries, per browser.
   *
   * Read once when a browser is first opened and kept for the session. The
   * indexes themselves are Foundry's and already in memory, so this is only
   * avoiding the work of walking the registry or the pack list on every
   * keystroke — which matters more for gear, where that walk covers over two
   * thousand entries across five packs.
   *
   * @type {Record<string, object[]|null>}
   */
  #browserEntries = { spells: null, items: null };

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
      return;
    }

    if ( event.target.classList.contains("phonedry-browser__search") ) {
      this.#browserQuery = event.target.value;

      // Debounced, because this re-renders a list of up to forty rows and a
      // phone keyboard produces keystrokes faster than that is worth doing.
      this.#searchDebounced();
    }
  };

  /**
   * Re-render the browser after typing settles.
   *
   * The field keeps focus across the render because the render replaces the
   * list, not the input — but the input's value comes from state, so it has to
   * be mirrored above before this runs.
   */
  #searchDebounced = foundry.utils.debounce(() => {
    if ( !this.#browserMode ) return;

    const field = this.element.querySelector(".phonedry-browser__search");
    const start = field?.selectionStart;

    this.render({ parts: ["browser"] });
    this.#resetScroll(".phonedry-browser__results");

    const refocused = this.element.querySelector(".phonedry-browser__search");
    if ( refocused && (document.activeElement !== refocused) ) {
      refocused.focus();
      if ( start != null ) refocused.setSelectionRange(start, start);
    }
  }, 200);

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

  /**
   * Keep enriched links inside the sheet.
   *
   * A description is full of them — Radiance of the Dawn cites Darkness, a
   * condition cites another condition — and Foundry's own handler answers a
   * click by opening that document's sheet. On a phone that is a trap: the
   * sheet is a desktop application sized for a desktop, it opens over
   * everything, and its close button lands off the edge of the screen. With the
   * sidebar suppressed there is then no way back at all short of reloading.
   *
   * So the click is taken before it reaches Foundry and answered in the panel
   * that is already open. The panel can render both kinds of target already: a
   * rules page keeps its text in `text.content`, an item in
   * `system.description.value`.
   */
  #onContentLink = event => {
    const link = event.target.closest("a.content-link[data-uuid]");
    if ( !link || !this.element.contains(link) ) return;

    // Both are needed. `preventDefault` stops the navigation; stopping
    // propagation is what keeps the event from reaching the document-level
    // handler Foundry installs, which is what opens the sheet.
    event.preventDefault();
    event.stopPropagation();

    this.#showDescription(link.dataset.uuid, { push: true });
  };

  /**
   * Show a document in the description panel.
   *
   * @param {string} uuid
   * @param {object} [options]
   * @param {boolean} [options.push]  Keep the current panel to come back to.
   */
  async #showDescription(uuid, { push = false } = {}) {
    const doc = await fromUuid(uuid);
    if ( !doc ) return;

    const described = await describeDocument(doc);
    if ( !described ) return;

    if ( push && this.#describe ) this.#describeStack.push(this.#describe);
    this.#describe = described;
    this.render({ parts: ["describe"] });
  }

  /**
   * Replace artwork that fails to load.
   *
   * Missing art is ordinary rather than exceptional: a module gets uninstalled,
   * a world is copied without its user files, an asset is renamed. The result
   * is a browser's broken-image glyph, which on a row of portraits reads as the
   * sheet being broken rather than as one picture being absent.
   *
   * Delegated from the root in the capture phase, because `error` does not
   * bubble — and delegated at all so this covers every image on the sheet
   * rather than the one screen that happened to prompt it. The flag stops a
   * fallback that is itself missing from looping.
   */
  #onImageError = event => {
    const img = event.target;
    if ( !(img instanceof HTMLImageElement) || img.dataset.fallback ) return;

    img.dataset.fallback = "true";
    img.src = "icons/svg/mystery-man.svg";
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
      tab: this.#tab,
      tabTemplate: `modules/${MODULE_ID}/templates/tabs/${this.#tab}.hbs`,
      tabs: TABS.map(tab => ({ ...tab, active: tab.id === this.#tab })),
      rollMode: this.#rollMode,
      rollLog: this.#rollLog,
      rollLogOpen: this.#rollLogOpen,
      formula: this.#formula,

      // The view model, or null. The template branches on this rather than on
      // the actor, so an actor that somehow fails to map still lands on the
      // empty state instead of throwing inside Handlebars.
      // Tool names live on compendium items rather than in config, so dnd5e
      // resolves them through its own Trait helper. Handed in for the same
      // reason item type labels are: the mapper must stay free of Foundry
      // globals to be unit-testable.
      stats: actor ? buildStatsView(actor, CONFIG.DND5E, this.#toolLabels(actor)) : null,

      features: actor ? buildFeaturesView(actor, CONFIG.DND5E) : null,
      spells: actor ? buildSpellsView(actor, CONFIG.DND5E) : null,
      // Item type names come from core rather than dnd5e, and are localised
      // keys, so they are handed in rather than looked up inside the mapper —
      // which must stay free of Foundry globals to be unit-testable.
      actions: actor ? buildActionsView(actor, CONFIG.DND5E, CONFIG.Item.typeLabels) : null,

      // Same reasoning as the actions view for the type labels, and the same
      // reason for handing in the config: the mapper stays free of Foundry
      // globals so it can be unit-tested against plain objects.
      items: actor ? buildInventoryView(actor, CONFIG.DND5E, CONFIG.Item.typeLabels) : null,

      // `allApplicableEffects` is dnd5e's own reckoning of what is currently
      // applying, and it reaches effects living on the character's items as
      // well as on the character — which is where a Rage or a Divine Order
      // actually lives. Collecting the generator here keeps the mapper pure.
      // `actor.concentration` is dnd5e's own reckoning of what is being held
      // on to, and it resolves the spell behind each effect — including one
      // cast from a scroll that no longer exists. Collecting it here keeps the
      // mapper pure.
      conditions: actor
        ? buildConditionsView(
          actor, [...actor.allApplicableEffects()], CONFIG.DND5E, actor.concentration
        )
        : null,
      browser: this.#prepareBrowser(actor),
      describe: this.#describe,
      targets: this.#prepareTargets(),
      describeBack: this.#describeStack.length > 0,

      // Reuses `resolveCharacter`'s own reckoning of what this user owns,
      // rather than walking `game.actors` a second time — it already excludes
      // NPCs and vehicles for the same reason the empty state does. The
      // currently-shown actor is filtered out here rather than there, because
      // the empty state's use of `candidates` needs the full list.
      switcher: {
        open: this.#switcherOpen,
        candidates: candidates
          .filter(a => a.id !== actor?.id)
          .map(a => ({ id: a.id, name: a.name, img: a.img }))
      },

      empty: actor ? null : {
        reason,
        userName: game.user.name,
        candidates: candidates.map(a => ({ id: a.id, name: a.name }))
      }
    });
  }

  /**
   * Names for the tools this character is trained in.
   *
   * A tool's name is the name of its compendium item — "Calligrapher's
   * Supplies" — rather than a string in config, and `Trait.keyLabel` is dnd5e's
   * own route to it. Guarded because that helper is not part of any documented
   * API, and a tool with no name is worth less than a tool listed under its key.
   *
   * @param {Actor} actor
   * @returns {Record<string, string>}
   */
  #toolLabels(actor) {
    const keyLabel = dnd5e?.documents?.Trait?.keyLabel;
    if ( typeof keyLabel !== "function" ) return {};

    const labels = {};
    for ( const key of Object.keys(actor.system?.tools ?? {}) ) {
      labels[key] = String(keyLabel(key, { trait: "tool" }) ?? key);
    }

    return labels;
  }

  /**
   * The target picker's context.
   *
   * @returns {object}
   */
  #prepareTargets() {
    if ( !this.#targeting ) return { open: false, groups: [], count: 0 };

    const isSpell = this.#targeting.kind === "spell";

    return {
      open: true,
      ...buildTargetsView({
        // A spell's own activities are not resolved yet — dnd5e picks when it
        // is cast — so the first stands in for the check, same heuristic
        // `#onCastSpell` uses. An activity reached from the actions screen is
        // already the exact one that will run.
        activity: isSpell
          ? this.#targeting.item.system?.activities?.contents?.[0]
          : this.#targeting.activity,
        name: isSpell ? this.#targeting.item.name : (this.#targeting.activity.item?.name ?? ""),
        candidates: this.#candidates,
        selected: this.#selectedTargets
      })
    };
  }

  /**
   * Everything that differs between the two compendium browsers.
   *
   * Collected in one place so the difference between them is a table to read
   * rather than a set of branches scattered through the shell. `search` is the
   * only entry doing real work; the rest are wording and a source of entries.
   *
   * @type {Record<string, object>}
   */
  static #BROWSERS = {
    spells: {
      placeholder: "PHONEDRY.Spells.SearchPlaceholder",
      searchLabel: "PHONEDRY.Spells.SearchLabel",
      sortLabel: "PHONEDRY.Spells.SortLabel",
      hint: "PHONEDRY.Describe.HintBrowser",
      emptyBody: "PHONEDRY.Spells.NoList",
      sorts: [
        { id: SORTS.NAME, label: "PHONEDRY.Spells.SortName" },
        { id: SORTS.LEVEL, label: "PHONEDRY.Spells.SortLevel" },
        { id: SORTS.SCHOOL, label: "PHONEDRY.Spells.SortSchool" }
      ],
      entries: actor => getAvailableSpells(actor),
      add: (actor, uuid) => addSpell(actor, uuid),
      search: (entries, query, sort, actor) => searchSpells(entries, {
        query, sort,
        owned: ownedSpellIds(actor),
        labels: { levels: CONFIG.DND5E.spellLevels, schools: CONFIG.DND5E.spellSchools }
      })
    },

    items: {
      placeholder: "PHONEDRY.Items.SearchPlaceholder",
      searchLabel: "PHONEDRY.Items.SearchLabel",
      sortLabel: "PHONEDRY.Items.SortLabel",
      hint: "PHONEDRY.Describe.HintItemBrowser",
      emptyBody: "PHONEDRY.Items.NoPacks",
      sorts: [
        { id: ITEM_SORTS.NAME, label: "PHONEDRY.Items.SortName" },
        { id: ITEM_SORTS.TYPE, label: "PHONEDRY.Items.SortType" }
      ],
      entries: () => getAvailableItems(),
      add: (actor, uuid) => addItem(actor, uuid),

      /*
       * Rarities arrive from dnd5e already localised, because it runs them
       * through its own `preLocalize`. Core's item type names do not — they are
       * still keys like "TYPES.Item.equipment" — so they are localised here.
       *
       * It has to happen on this side of the call. The mapper composes the
       * row's second line into a finished string, and it must stay free of
       * Foundry globals to be unit-testable, so it cannot do the lookup itself.
       */
      search: (entries, query, sort) => searchItems(entries, {
        query, sort,
        labels: {
          types: Object.fromEntries(Object.entries(CONFIG.Item.typeLabels)
            .map(([type, label]) => [type, game.i18n.localize(label)])),
          rarities: CONFIG.DND5E.itemRarity
        }
      })
    }
  };

  /**
   * The open browser's context.
   *
   * Search runs here rather than in the template because it is a filter over up
   * to a couple of thousand entries, and Handlebars is the wrong place for that.
   *
   * @param {Actor|null} actor
   * @returns {object}
   */
  #prepareBrowser(actor) {
    // Closed, but the part still renders — hidden by an attribute rather than
    // by being absent, so opening it is a re-render of one part rather than a
    // structural change. The spells browser's wording is the fallback simply
    // because something has to be, and nothing is visible either way.
    const mode = this.#browserMode ?? "spells";
    const config = PhonedryShell.#BROWSERS[mode];
    const sort = this.#browserSort[mode];

    const chrome = {
      placeholder: config.placeholder,
      searchLabel: config.searchLabel,
      sortLabel: config.sortLabel,
      hint: config.hint,
      emptyBody: config.emptyBody,
      query: this.#browserQuery,
      sorts: config.sorts.map(s => ({ ...s, active: s.id === sort }))
    };

    if ( !this.#browserMode || !actor ) {
      return { ...chrome, open: false, results: [], total: 0, truncated: false };
    }

    return {
      ...chrome,
      open: true,
      ...config.search(this.#browserEntries[mode] ?? [], this.#browserQuery, sort, actor)
    };
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onRender(context, options) {
    super._onRender(context, options);

    this.#applyRollMode();
    this.#applyHpEditorState();
    this.#bindLongPress();
    this.#bindCharacterSwitch();
    this.#registerHooks();

    // Bound to the application root rather than to the field, because the field
    // is replaced on every log re-render while the root is not. Re-adding the
    // same function reference is a no-op, so these do not stack up.
    this.element.addEventListener("input", this.#onFormulaInput);
    this.element.addEventListener("keydown", this.#onFormulaKey);
    this.element.addEventListener("click", this.#onContentLink);
    this.element.addEventListener("error", this.#onImageError, true);

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
   * Wire up holding a row to see what it is.
   *
   * Rebound on every render, because a partial re-render replaces the element
   * the previous binding was attached to. The old binding is torn down first —
   * without that, a sheet that has re-rendered five times would open five
   * panels for one hold.
   */
  #bindLongPress() {
    this.#unbindLongPress?.();
    const selector = "[data-describe], [data-describe-uuid]";
    this.#unbindLongPress = bindLongPress(this.element, selector, async target => {
      const doc = await resolveDescribable(target.dataset, this.#actor);
      if ( !doc ) return;

      this.#describe = await describeDocument(doc);

      // A hold starts a new trail rather than extending whatever was open
      // before it.
      this.#describeStack = [];

      this.render({ parts: ["describe"] });
    });
  }

  /**
   * Wire up holding the portrait or name to switch character.
   *
   * A separate binding from `#bindLongPress` rather than a second case inside
   * it: that one resolves a describable document and always has something to
   * show, where this one opens a fixed panel regardless of what was held, and
   * conflating the two selectors would mean the header also responding to
   * `data-describe`, which it does not carry.
   *
   * Rebound on every render for the same reason as `#bindLongPress` — a
   * partial re-render replaces the header's elements, and the old binding
   * would be listening on detached nodes.
   */
  #bindCharacterSwitch() {
    this.#unbindCharacterSwitch?.();
    const selector = "[data-switch-character]";
    this.#unbindCharacterSwitch = bindLongPress(this.element, selector, () => {
      this.#switcherOpen = true;
      this.render({ parts: ["switcher"] });
    });
  }

  /**
   * Send a scrolling container back to the top.
   *
   * The counterpart to the `scrollable` declarations on the parts. Preserving
   * scroll is right when the same list is being rebuilt underneath the player —
   * preparing a spell, adding one — and wrong when the content changes identity,
   * because a position measured against the old list means nothing against the
   * new one. Switching tab and running a new search are both the second case,
   * and land the player halfway down a list they have not seen the top of.
   *
   * @param {string} selector
   */
  #resetScroll(selector) {
    const el = this.element.querySelector(selector);
    if ( el ) el.scrollTop = 0;
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

    /*
     * `character` can change without any action of this sheet's own — the GM
     * reassigning it from Configure Players, or another of this player's
     * clients switching it — and not just through the switcher panel. Routing
     * every path through this one hook, rather than resetting state inline in
     * the switch handler, means a reassignment from outside Phonedry is
     * handled exactly the same way as one made from inside it.
     *
     * A full state reset rather than just a re-render: every panel here is
     * scoped to whichever actor was showing when it opened, and carrying one
     * across to a different character is never right — a description panel
     * left open would show a rule for an item the new character may not even
     * have.
     */
    this.#hooks.push(["updateUser", Hooks.on("updateUser", (user, changes) => {
      if ( (user.id !== game.user.id) || !("character" in changes) ) return;

      this.#tab = DEFAULT_TAB;
      this.#switcherOpen = false;
      this.#describe = null;
      this.#describeStack = [];
      this.#browserMode = null;
      this.#browserQuery = "";
      this.#targeting = null;
      this.#selectedTargets = new Set();
      this.#hpEditorOpen = false;
      this.#rollLog = [];

      this.render();
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
      case "tool": return rollToolCheck(this.actor, key, mode);
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
  static async #onSetTab(event, target) {
    const tab = target.dataset.tab;
    if ( !tab || (tab === this.#tab) ) return;

    this.#tab = tab;

    // The header does not change with the tab, and rebuilding it would drop an
    // open hit point editor for no reason.
    await this.render({ parts: ["content", "tabs"] });

    // A different section entirely, so the preserved position is meaningless.
    this.#resetScroll(".phonedry-content");
  }

  /**
   * Cast a spell.
   *
   * @this {PhonedryShell}
   */
  static #onCastSpell(event, target) {
    const spell = this.actor?.items.get(target.dataset.spellId);
    if ( !spell ) return;

    /*
     * A spell aimed at creatures gets the picker first; everything else casts
     * straight through. The check is on the activity rather than on the spell,
     * because "does this want targets" is a property of what the spell does —
     * and a template spell is excluded there rather than here.
     *
     * Candidates are captured now rather than read at render time, so the list
     * cannot shift under the player mid-choice if a combatant is added.
     */
    const activity = spell.system?.activities?.contents?.[0];
    const candidates = needsTargets(activity) ? collectCandidates(this.actor) : [];

    if ( !candidates.length ) return castSpell(spell, [], this.rollMode);

    this.#targeting = { kind: "spell", item: spell };
    this.#candidates = candidates;
    this.#selectedTargets = new Set();
    this.render({ parts: ["targets"] });
  }

  /**
   * Add or remove a target.
   *
   * @this {PhonedryShell}
   */
  static #onToggleTarget(event, target) {
    const id = target.dataset.targetId;
    if ( this.#selectedTargets.has(id) ) this.#selectedTargets.delete(id);
    else this.#selectedTargets.add(id);

    this.render({ parts: ["targets"] });
  }

  /**
   * Act on whoever is selected.
   *
   * @this {PhonedryShell}
   */
  static #onConfirmTargets() {
    const targeting = this.#targeting;
    if ( !targeting ) return;

    const descriptors = targetDescriptors(this.#candidates, this.#selectedTargets);

    // Broadcast before acting, so a GM watching the map sees the targeting as
    // the card arrives rather than a moment after it.
    if ( descriptors.length ) broadcastTargets(this.#candidates, this.#selectedTargets);

    this.#closeTargeting();

    if ( targeting.kind === "spell" ) castSpell(targeting.item, descriptors, this.rollMode);
    else {
      useActivity(this.actor, targeting.activity.item.id, targeting.activity.id, descriptors, this.rollMode);
    }
  }

  /**
   * Abandon the choice without casting.
   *
   * @this {PhonedryShell}
   */
  static #onCloseTargets() {
    this.#closeTargeting();
  }

  /** Put the picker away. */
  #closeTargeting() {
    this.#targeting = null;
    this.#candidates = [];
    this.#selectedTargets = new Set();
    this.render({ parts: ["targets"] });
  }

  /**
   * Take a short or long rest.
   *
   * dnd5e's own dialog is kept rather than suppressed, which is the opposite of
   * the choice made for initiative — and right for the same reason it was wrong
   * there. Initiative's dialog only collected an advantage mode the sheet
   * already knew; this one is where hit dice are actually spent, so removing it
   * would mean rebuilding that.
   *
   * @this {PhonedryShell}
   */
  static #onRest(event, target) {
    if ( this.actor ) takeRest(this.actor, target.dataset.rest);
  }

  /**
   * Turn a condition on or off.
   *
   * @this {PhonedryShell}
   */
  static #onToggleCondition(event, target) {
    if ( !this.actor ) return;
    setCondition(this.actor, target.dataset.condition, target.getAttribute("aria-pressed") !== "true");
  }

  /**
   * Grant or spend inspiration.
   *
   * @this {PhonedryShell}
   */
  static #onToggleInspiration(event, target) {
    if ( !this.actor ) return;
    setInspiration(this.actor, target.getAttribute("aria-pressed") !== "true");
  }

  /**
   * Roll to keep concentration.
   *
   * Uses the sheet's advantage selector like every other roll. dnd5e adds its
   * own advantage on top where a feature grants it, so a War Caster is not
   * quietly overridden by the header sitting on normal.
   *
   * @this {PhonedryShell}
   */
  static #onRollConcentration() {
    if ( this.actor ) rollConcentration(this.actor, this.rollMode);
  }

  /**
   * Stop concentrating.
   *
   * @this {PhonedryShell}
   */
  static #onEndConcentration(event, target) {
    if ( this.actor ) endConcentration(this.actor, target.dataset.effectUuid);
  }

  /**
   * Step exhaustion up a level, wrapping to zero past the top.
   *
   * One control for the whole range. A separate up and down pair would take
   * twice the width in a grid where every chip is already at the minimum size a
   * thumb can hit, and exhaustion is nearly always walked upwards — the way
   * back down is a long rest, not a button.
   *
   * @this {PhonedryShell}
   */
  static #onStepExhaustion(event, target) {
    if ( !this.actor ) return;

    const max = Number(target.dataset.levels);
    const current = this.actor.system?.attributes?.exhaustion ?? 0;
    setExhaustion(this.actor, (current >= max) ? 0 : (current + 1), max);
  }

  /**
   * Stop an applied effect applying, or let it apply again.
   *
   * @this {PhonedryShell}
   */
  static #onToggleEffect(event, target) {
    setEffectDisabled(target.dataset.effectUuid, target.dataset.disabled !== "true");
  }

  /**
   * Use an activity — an attack, a feature, a consumable.
   *
   * The row carries both ids because an activity is only unique within its
   * item. Going to the activity rather than the item is what keeps this to one
   * tap: `Item#use` on Channel Divinity would open a dialog asking which of its
   * three activities was meant, and the row has already answered that.
   *
   * An attack that hits a creature gets the picker first, the same as a spell
   * does — a weapon swung at nobody is not a meaningful tap, and without this
   * the chat card would name no target the way every spell's used to before
   * `castSpell` got the same treatment. The check is generic rather than
   * gated on the item being a weapon: `needsTargets` reads the activity's own
   * configuration, so a feature that targets creatures — Turn Undead, aimed at
   * a pack rather than one — gets the same picker for the same reason.
   *
   * @this {PhonedryShell}
   */
  static #onUseActivity(event, target) {
    if ( !this.actor ) return;

    const { itemId, activityId } = target.dataset;
    const activity = findActivity(this.actor, itemId, activityId);
    if ( !activity ) return;

    const candidates = needsTargets(activity) ? collectCandidates(this.actor) : [];

    if ( !candidates.length ) {
      useActivity(this.actor, itemId, activityId, [], this.rollMode);
      return;
    }

    this.#targeting = { kind: "activity", activity };
    this.#candidates = candidates;
    this.#selectedTargets = new Set();
    this.render({ parts: ["targets"] });
  }

  /**
   * Equip or stow an item.
   *
   * No re-render here: the write goes to the item, and `updateItem` is already
   * one of the hooks the sheet refreshes on — so equipping a shield rebuilds
   * both this row and the armour class in the header, which is the point.
   *
   * @this {PhonedryShell}
   */
  static #onToggleEquipped(event, target) {
    const item = this.actor?.items.get(target.dataset.itemId);
    if ( item ) setEquipped(item, target.getAttribute("aria-pressed") !== "true");
  }

  /**
   * Attune to an item, or let the attunement go.
   *
   * @this {PhonedryShell}
   */
  static #onToggleAttuned(event, target) {
    const item = this.actor?.items.get(target.dataset.itemId);
    if ( item ) setAttuned(item, target.getAttribute("aria-pressed") !== "true");
  }

  /**
   * Read what an item is.
   *
   * The inventory screen is the one place where reading is the row's primary
   * action rather than a secondary gesture: using an item lives on the actions
   * screen and equipping has its own control, so nothing else competes for the
   * tap. The hold still works — the row carries `data-describe` as well — which
   * is what makes the gesture learned on the spells screen keep working here.
   *
   * @this {PhonedryShell}
   */
  static async #onDescribeItem(event, target) {
    const item = this.actor?.items.get(target.dataset.itemId);
    if ( !item ) return;

    this.#describe = await describeDocument(item);

    // A fresh tap starts a new trail rather than extending whatever chain of
    // links was followed the last time the panel was open.
    this.#describeStack = [];

    this.render({ parts: ["describe"] });
  }

  /**
   * Prepare or unprepare a spell.
   *
   * @this {PhonedryShell}
   */
  static #onTogglePrepared(event, target) {
    const spell = this.actor?.items.get(target.dataset.spellId);
    if ( spell ) setPrepared(spell, target.getAttribute("aria-pressed") !== "true");
  }

  /**
   * Open a compendium browser.
   *
   * Which one comes off the button, so the spells screen and the inventory
   * screen share one control and one panel.
   *
   * @this {PhonedryShell}
   */
  static #onOpenBrowser(event, target) {
    if ( !this.actor ) return;

    const mode = target.dataset.browser;
    if ( !PhonedryShell.#BROWSERS[mode] ) return;

    // Read once per session. Walking the spell registry is cheap; walking five
    // compendium indexes for gear is not cheap enough to repeat on every
    // keystroke.
    this.#browserEntries[mode] ??= PhonedryShell.#BROWSERS[mode].entries(this.actor);

    this.#browserMode = mode;

    // A fresh search each time. Reopening on the last query would show results
    // for something the player was looking for on a different occasion, and the
    // field would need clearing before it could be used.
    this.#browserQuery = "";

    this.render({ parts: ["browser"] });
    this.#resetScroll(".phonedry-browser__results");

    // Focus after the render that builds the field, so the keyboard comes up
    // ready to type rather than after a second tap.
    this.element.querySelector(".phonedry-browser__search")?.focus();
  }

  /**
   * Close the spell browser.
   *
   * @this {PhonedryShell}
   */
  static #onLogOut() {
    // Core's own call, so it tears the session down the same way the sidebar
    // button does rather than just navigating away from a live connection.
    game.logOut();
  }

  /**
   * Close the description panel.
   *
   * @this {PhonedryShell}
   */
  static #onCloseDescription(event, target) {
    /*
     * The backdrop carries the same action as the close button, so a tap on the
     * dimmed area dismisses the panel. Anything inside the panel has to be let
     * through, though: without this guard the action would also fire for taps
     * on the description itself — selecting an inline reference, or starting a
     * scroll — and the panel would shut the moment anyone tried to read it.
     */
    const isBackdrop = target.classList.contains("phonedry-describe");
    if ( isBackdrop && event.target.closest(".phonedry-describe__panel") ) return;

    /*
     * Dismissing means going back while there is anywhere to go back to.
     *
     * Following a link replaces what the panel shows, so a player who taps away
     * from a cited rule means "take me back to what I was reading", not "throw
     * away both". Only at the root does dismissing close the panel. The control
     * changes to a back arrow to say so, and the backdrop follows the same
     * rule — the two must agree, or which one you use decides whether you keep
     * your place.
     */
    const previous = this.#describeStack.pop();
    this.#describe = previous ?? null;

    this.render({ parts: ["describe"] });
  }

  /**
   * Order the open browser's results.
   *
   * @this {PhonedryShell}
   */
  static async #onSetBrowserSort(event, target) {
    if ( !this.#browserMode ) return;

    this.#browserSort[this.#browserMode] = target.dataset.sort;
    await this.render({ parts: ["browser"] });

    // Reordering puts different rows under the same scroll position, so the
    // player would land in the middle of a list they have not seen the top of.
    this.#resetScroll(".phonedry-browser__results");
  }

  /**
   * Close whichever browser is open.
   *
   * @this {PhonedryShell}
   */
  static #onCloseBrowser() {
    this.#browserMode = null;
    this.render({ parts: ["browser"] });
  }

  /**
   * Close the character switcher.
   *
   * Same backdrop-tap convention as the description panel: the backdrop and
   * the close button share this action, and a tap that lands on the panel
   * itself — the heading, or the gap between rows — has to be let through
   * rather than closing the panel out from under a player who is still
   * choosing.
   *
   * @this {PhonedryShell}
   */
  static #onCloseSwitcher(event, target) {
    const isBackdrop = target.classList.contains("phonedry-switcher");
    if ( isBackdrop && event.target.closest(".phonedry-switcher__panel") ) return;

    this.#switcherOpen = false;
    this.render({ parts: ["switcher"] });
  }

  /**
   * Switch which of the player's own characters this sheet shows.
   *
   * Only sets `user.character` — everything else that changing it entails
   * (resetting the open tab, closing whatever panel was open, clearing the
   * roll log) happens in the `updateUser` hook in `#registerHooks`, so a
   * reassignment made here is handled identically to one made from the GM's
   * Configure Players dialog.
   *
   * @this {PhonedryShell}
   */
  static async #onSwitchCharacter(event, target) {
    const id = target.dataset.actorId;
    if ( !id || (id === this.#actor?.id) ) return;

    await game.user.update({ character: id });
  }

  /**
   * Add the tapped row to the character.
   *
   * The browser stays open: adding is something done in a run — spells at level
   * up, gear after a shopping trip — and closing after each one would mean
   * reopening and retyping.
   *
   * @this {PhonedryShell}
   */
  static async #onAddFromBrowser(event, target) {
    if ( !this.actor || !this.#browserMode ) return;

    await PhonedryShell.#BROWSERS[this.#browserMode].add(this.actor, target.dataset.uuid);

    // The list behind the browser is now stale, and for spells so is the
    // browser's own "already known" marking.
    this.render({ parts: ["content", "browser"] });
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
    this.#unbindLongPress?.();
    this.#unbindLongPress = null;
    this.#unbindCharacterSwitch?.();
    this.#unbindCharacterSwitch = null;

    this.element.removeEventListener("input", this.#onFormulaInput);
    this.element.removeEventListener("keydown", this.#onFormulaKey);
    this.element.removeEventListener("click", this.#onContentLink);
    this.element.removeEventListener("error", this.#onImageError, true);

    for ( const [hook, id] of this.#hooks ) Hooks.off(hook, id);
    this.#hooks = [];

    window.removeEventListener("resize", this.#onViewportChange);
    window.removeEventListener("orientationchange", this.#onViewportChange);
    super._onClose(options);
  }
}
