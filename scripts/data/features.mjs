/**
 * The actor → view model mapper for the features screen.
 *
 * Pure and synchronous like the other mappers.
 *
 * Two things share this screen, and they are both answers to "what is true
 * about my character" rather than "what can I do this turn". **Features** are
 * the things a class, species, background or feat gave you that you do not
 * activate — Spellcasting, Gnomish Cunning, Observant. **Traits** are the
 * standing facts underneath them: what you resist, what you speak, what you are
 * trained to wield.
 *
 * ## The partition that matters
 *
 * A feature belongs here exactly when the actions screen does not show it.
 * That is not a rule of thumb — it is the whole correctness condition. The
 * actions screen lists activities; anything with none, or whose only activities
 * are ones dnd5e marks passive, produces no row there. Before this screen,
 * those features existed on the character and appeared nowhere at all.
 *
 * So the test is `itemOffersActions` and `isPassiveActivation`, imported from
 * the actions mapper rather than restated. If the two ever disagree, a feature
 * is either invisible or listed twice, and both are worse than either screen
 * being slightly wrong on its own.
 */

import { isPassiveActivation, itemOffersActions } from "./actions.mjs";

/**
 * The order feature groups appear in.
 *
 * Class first, because it is the bulk of what a character can do and what they
 * look up most. Then species and feats, which are chosen rather than levelled
 * into, then background last — it is a single feature and rarely consulted.
 *
 * These are `system.type.value` on a feat item, which is dnd5e's own
 * classification. A type not listed sorts to the end rather than disappearing.
 */
const GROUP_ORDER = ["class", "race", "feat", "background", "enchantment", "monster"];

/**
 * Trait rows describing what gets through and what does not.
 *
 * Shown as a block or not at all. Individually they would be ambiguous: a
 * missing "Resistances" row could mean the character resists nothing or that
 * the sheet does not show resistances, and on the one screen a player checks
 * before taking damage that difference matters. Shown together, an empty row
 * inside the block is a definite "none".
 */
const DEFENCES = [
  { key: "dr", label: "PHONEDRY.Features.Resistances", source: "damageTypes" },
  { key: "di", label: "PHONEDRY.Features.Immunities", source: "damageTypes" },
  { key: "dv", label: "PHONEDRY.Features.Vulnerabilities", source: "damageTypes" },
  { key: "ci", label: "PHONEDRY.Features.ConditionImmunities", source: "conditionTypes" }
];

/* -------------------------------------------- */

/**
 * Does this item belong on the features screen?
 *
 * Only `feat` items. The `class`, `subclass`, `race` and `background` items are
 * the containers rather than the contents — "Cleric" and "Gnome, Forest" are
 * already named in the header, and the traits they grant arrive as separate
 * feat items carrying `system.type.value` of "class" or "race".
 *
 * @param {object} item
 * @param {object} config  `CONFIG.DND5E`.
 * @returns {boolean}
 */
export function isPassiveFeature(item, config = {}) {
  if ( item?.type !== "feat" ) return false;

  // Nothing to activate at all: Spellcasting, Observant, Blessed Strikes.
  if ( !itemOffersActions(item) ) return true;

  /*
   * Or everything it can do is something that happens *to* the character —
   * dnd5e flags a "short rest" or "start of turn" activation as passive, and
   * the actions screen skips those. Without this, a feature that recharges
   * itself on a rest would fall between the two screens.
   */
  return (item.system?.activities?.contents ?? [])
    .every(activity => isPassiveActivation(activity.activation?.type ?? "", config));
}

/**
 * Describe one feature as a row.
 *
 * @param {object} item
 * @param {object} config  `CONFIG.DND5E`.
 * @returns {object}
 */
export function describeFeature(item, config = {}) {
  const type = item.system?.type ?? {};
  const subtypes = config.featureTypes?.[type.value]?.subtypes ?? {};

  return {
    id: item.id,
    name: item.name,
    img: item.img,

    group: type.value || "feat",

    // "Channel Divinity" under a Channel Divinity feature, where dnd5e records
    // one. Only shown when it adds something the group heading does not.
    subtitle: subtypes[type.subtype] ?? null,

    // A limited-use passive still has a pool worth seeing — a feature that
    // recharges on a rest is exactly the kind that lands here rather than on
    // the actions screen.
    uses: (item.system?.uses?.max > 0)
      ? { value: item.system.uses.value ?? 0, max: item.system.uses.max }
      : null,

    // What a level or a prerequisite demanded, where dnd5e recorded one.
    requirements: item.system?.requirements || null
  };
}

/* -------------------------------------------- */

/**
 * Group the character's passive features by where they came from.
 *
 * @param {object[]} items  The actor's items.
 * @param {object} config   `CONFIG.DND5E`.
 * @returns {object[]}
 */
export function buildFeatureGroups(items = [], config = {}) {
  const groups = new Map();

  for ( const item of items ) {
    if ( !isPassiveFeature(item, config) ) continue;

    const row = describeFeature(item, config);
    if ( !groups.has(row.group) ) groups.set(row.group, []);
    groups.get(row.group).push(row);
  }

  return [...groups.entries()]
    .sort(([a], [b]) => rank(a) - rank(b))
    .map(([type, entries]) => ({
      type,
      label: config.featureTypes?.[type]?.label ?? type,

      // Alphabetical within a group. The order features were added in is the
      // order they were levelled into, which nobody remembers and cannot be
      // navigated by on a phone.
      entries: entries.sort((a, b) => a.name.localeCompare(b.name))
    }));
}

/**
 * Where a feature group sorts. Unknown types go last, in a stable order.
 *
 * @param {string} type
 * @returns {number}
 */
function rank(type) {
  const index = GROUP_ORDER.indexOf(type);
  return (index === -1) ? GROUP_ORDER.length : index;
}

/* -------------------------------------------- */

/**
 * Turn a set of trait keys into a readable list.
 *
 * dnd5e stores these as keys — "sim", "lgt", "common" — against config objects
 * whose shapes are not consistent: damage types keep their name under `label`,
 * conditions under `name`, and proficiencies are plain strings. The lookup
 * handles all three rather than the caller having to know which is which.
 *
 * @param {Set<string>|string[]} values  The trait's keys.
 * @param {object} labels                The config object naming them.
 * @param {string} [custom]              dnd5e's free-text additions, semicolon separated.
 * @returns {string[]}
 */
export function labelTrait(values = [], labels = {}, custom = "") {
  const named = [...values].map(key => {
    const entry = labels[key];
    if ( typeof entry === "string" ) return entry;
    return entry?.label ?? entry?.name ?? key;
  });

  // Anything the GM typed by hand. Semicolons are dnd5e's separator here, not
  // commas — a custom entry may well contain a comma of its own.
  const typed = (custom ?? "").split(";").map(s => s.trim()).filter(Boolean);

  return [...named, ...typed].sort((a, b) => a.localeCompare(b));
}

/**
 * Everything the character resists, ignores or suffers extra from.
 *
 * @param {object} traits  The actor's `system.traits`.
 * @param {object} config  `CONFIG.DND5E`.
 * @returns {object[]}  Empty when the character has none of any of them.
 */
export function buildDefences(traits = {}, config = {}) {
  const rows = DEFENCES.map(({ key, label, source }) => {
    const trait = traits[key] ?? {};
    const values = labelTrait(trait.value, config[source], trait.custom);

    /*
     * What gets through anyway. A resistance that magical weapons ignore is a
     * materially different fact from one that nothing ignores, and dnd5e keeps
     * it in a separate set that is easy to render and forget.
     */
    const bypasses = labelTrait(trait.bypasses, config.itemProperties);

    return { label, values, bypasses };
  });

  return rows.some(row => row.values.length) ? rows : [];
}

/**
 * What the character speaks and is trained to use.
 *
 * @param {object} traits  The actor's `system.traits`.
 * @param {object} config  `CONFIG.DND5E`.
 * @returns {object[]}
 */
export function buildProficiencies(traits = {}, config = {}) {
  return [
    {
      label: "PHONEDRY.Features.Languages",
      values: labelTrait(traits.languages?.value, flattenLanguages(config.languages), traits.languages?.custom)
    },
    {
      label: "PHONEDRY.Features.ArmourProficiencies",
      values: labelTrait(traits.armorProf?.value, config.armorProficiencies, traits.armorProf?.custom)
    },
    {
      label: "PHONEDRY.Features.WeaponProficiencies",
      values: labelTrait(traits.weaponProf?.value, config.weaponProficiencies, traits.weaponProf?.custom)
    }
  ].filter(row => row.values.length);
}

/**
 * Flatten dnd5e's nested language config into a flat key → name map.
 *
 * Languages are the one trait config that is a tree: standard and exotic
 * groups, each with `children`, and dialects nested a further level inside
 * some of those. The groups are headings rather than selectable values, so
 * only the leaves matter here.
 *
 * @param {object} languages  `CONFIG.DND5E.languages`.
 * @returns {Record<string, string>}
 */
export function flattenLanguages(languages = {}) {
  const flat = {};

  const walk = entries => {
    for ( const [key, entry] of Object.entries(entries ?? {}) ) {
      if ( typeof entry === "string" ) {
        flat[key] = entry;
        continue;
      }

      // A group contributes its children rather than itself; anything with a
      // label and no children is a language in its own right.
      if ( entry?.children ) walk(entry.children);
      else if ( entry?.label ) flat[key] = entry.label;
    }
  };

  walk(languages);
  return flat;
}

/* -------------------------------------------- */

/**
 * Build the whole features view model.
 *
 * @param {object} actor   An actor-shaped object.
 * @param {object} config  `CONFIG.DND5E`.
 * @returns {object}
 */
export function buildFeaturesView(actor, config = {}) {
  const traits = actor?.system?.traits ?? {};
  const groups = buildFeatureGroups(actor?.items ?? [], config);
  const defences = buildDefences(traits, config);
  const proficiencies = buildProficiencies(traits, config);

  return {
    groups,
    defences,
    proficiencies,

    // Small, Medium — a fact players forget and one that decides whether they
    // fit through the gap.
    size: config.actorSizes?.[traits.size]?.label ?? null,

    empty: !groups.length && !defences.length && !proficiencies.length
  };
}
