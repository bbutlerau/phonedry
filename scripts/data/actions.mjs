/**
 * The actor → view model mapper for the actions screen.
 *
 * Pure and synchronous like the other mappers, for the same reason: this is the
 * layer that breaks when dnd5e moves a field, and it can only be cheaply tested
 * if it depends on nothing.
 *
 * The unit of this screen is an **activity**, not an item. That is the whole
 * design decision, and it is what dnd5e 5.x made possible: Channel Divinity is
 * one item carrying three activities — Divine Spark: Heal, Divine Spark: Save
 * and Turn Undead — that share one pool of uses. An item-per-row sheet has to
 * put a dialog in front of that to ask which one you meant. A row per activity
 * asks nothing, which on a phone mid-combat is the difference between one tap
 * and three.
 */

/**
 * Item types that only offer their actions while equipped.
 *
 * A greatsword at the bottom of the pack is not an attack you can make this
 * turn, and listing it as one is how an actions screen fills with things that
 * are not actions. Everything else — features, consumables, tools — is either
 * always available or carried ready to use, so no equivalent test applies:
 * a flask of holy water is thrown from the pack, and requiring it to be
 * "equipped" first would hide a real action behind a rule nobody plays by.
 */
const EQUIPPED_ONLY = new Set(["weapon", "equipment"]);

/**
 * The order activation types appear in, which is the order of a turn.
 *
 * Not alphabetical and not dnd5e's config order: what a player reaches for
 * first is their action, then their bonus action, then whatever they are
 * holding a reaction for. Anything not listed here sorts to the end, so a new
 * activation type in a future dnd5e appears at the bottom rather than
 * disappearing.
 */
const GROUP_ORDER = ["action", "bonus", "reaction", "legendary", "special", "minute", "hour", "day"];

/**
 * The order kinds of thing appear in within a group.
 *
 * Weapons first, then features, then the things carried and spent. It follows
 * the same reasoning as the group order — what a fight reaches for soonest goes
 * highest — and it makes the list read as blocks matching the stripe colours
 * rather than as an alphabetical jumble of a mace, a lamp and a domain feature.
 *
 * An item type not listed here sorts to the end rather than disappearing.
 */
const TYPE_ORDER = ["weapon", "feat", "consumable", "equipment", "tool"];

/**
 * The group for activities with no activation type at all.
 *
 * dnd5e leaves the type empty for riders like Divine Strike — extra damage you
 * apply when something else has already happened. It is not an action in the
 * turn-economy sense, but it is very much something the player taps, so it gets
 * a bucket at the bottom rather than being dropped.
 */
export const OTHER_GROUP = "other";

/* -------------------------------------------- */

/**
 * Is this activation type one the player never triggers?
 *
 * dnd5e flags these in config — a "short rest" or "start of turn" activation is
 * something that happens *to* the character. Reading the flag rather than
 * keeping our own list means resting behaviour stays dnd5e's to define.
 *
 * @param {string} type    An activation type.
 * @param {object} config  `CONFIG.DND5E`.
 * @returns {boolean}
 */
export function isPassiveActivation(type, config = {}) {
  return !!config.activityActivationTypes?.[type]?.passive;
}

/**
 * Does this item contribute anything to the actions screen?
 *
 * @param {object} item
 * @returns {boolean}
 */
export function itemOffersActions(item) {
  // Spells have their own screen, with slots and preparation beside them, and
  // most of them belong there and nowhere else — a duplicate of every buff and
  // utility spell here is the thing players complain about on other sheets.
  // `qualifyingSpellActivity`, below, is the narrow exception: a spell counts
  // there rather than here, on its own path through `buildActionGroups`.
  if ( item.type === "spell" ) return false;

  if ( EQUIPPED_ONLY.has(item.type) && !item.system?.equipped ) return false;

  return (item.system?.activities?.contents?.length ?? 0) > 0;
}

/* -------------------------------------------- */

/**
 * Which of a spell's activities, if any, earns it a place on the actions
 * screen as well as its own.
 *
 * Two kinds of spell are things a fight reaches for by reflex rather than by
 * paging through a spell list: a smite, which exists only to modify a hit that
 * has already landed, and an attack cantrip, cast every round the way a weapon
 * is swung. Both earn a place beside the weapon they ride alongside.
 *
 * The rule is activation *and* purpose, not activation alone — most bonus
 * action spells are support or buffs, not reflexes, and cross-listing every
 * one of them would crowd the screen with the exact duplication
 * `itemOffersActions` excludes spells to avoid. A leveled spell with a bonus
 * or reaction activation qualifies on activation; a cantrip only qualifies
 * alongside an actual attack roll, which is what "cast every round" means.
 *
 * Checked activity by activity rather than by the item's first one, because a
 * spell with several activities is not guaranteed to have the qualifying kind
 * listed first — Divine Smite pairs each of its damage activities with an
 * internal "forward" one that carries no activation of its own worth reading.
 *
 * @param {object} item
 * @param {object} [config]  `CONFIG.DND5E`.
 * @returns {object|null}
 */
export function qualifyingSpellActivity(item, config = {}) {
  if ( item.type !== "spell" ) return null;

  const isCantrip = (item.system?.level ?? 0) === 0;

  for ( const activity of item.system?.activities?.contents ?? [] ) {
    const type = activity.activation?.type ?? "";
    if ( isPassiveActivation(type, config) ) continue;

    if ( (type === "bonus") || (type === "reaction") ) return activity;
    if ( isCantrip && (activity.type === "attack") && (type === "action") ) return activity;
  }

  return null;
}

/**
 * Does this spell also belong on the actions screen?
 *
 * @param {object} item
 * @param {object} [config]
 * @returns {boolean}
 */
export function spellCrossListsOnActions(item, config = {}) {
  return !!qualifyingSpellActivity(item, config);
}

/**
 * Describe one activity as a row.
 *
 * @param {object} activity   An activity, as dnd5e prepares it.
 * @param {object} item       The item it belongs to.
 * @param {boolean} multiple  Whether the item has more than one activity.
 * @param {object} [typeLabels]  Item type names, as `CONFIG.Item.typeLabels`.
 * @returns {object}
 */
export function describeActivity(activity, item, multiple, typeLabels = {}) {
  const labels = activity.labels ?? {};
  const uses = item.system?.uses ?? {};

  // Where an item has one activity, dnd5e names that activity for what it does
  // rather than what it is — a mace's activity is called "Attack". The item's
  // own name is the useful one. Where there are several, the reverse holds:
  // three rows all reading "Channel Divinity" would be useless.
  const name = multiple ? (activity.name || item.name) : item.name;

  return {
    key: `${item.id}.${activity.id}`,
    itemId: item.id,
    activityId: activity.id,
    spellId: null,

    // Which shell action a tap dispatches to. A row is one or the other never
    // both, so the template reads this rather than branching on whether
    // `spellId` is set — see `describeSpellAction` for the other side.
    action: "useActivity",

    // Whether the header's advantage/normal/disadvantage selector actually
    // does anything to this row's roll. True only for an attack — the one d20
    // roll `useActivity` configures the mode for, see the note above it — so
    // the stylesheet can tint this row along with the header's rolls and
    // nowhere else. `describeSpellAction` carries the same field for a
    // cross-listed attack cantrip, which `castSpell` gives the identical
    // treatment.
    attack: activity.type === "attack",

    name,

    // Only shown when it adds something. "Channel Divinity" under "Turn Undead"
    // says where the uses are coming from; "Mace" under "Mace" says nothing.
    subtitle: (name === item.name) ? null : item.name,

    // Artwork follows the name for the same reason. dnd5e gives an activity a
    // generic icon for what it is — every save activity gets the same arrow —
    // so a screen of single-activity rows using those is a column of identical
    // glyphs. The item's own art is what a player recognises without reading.
    // Where an item has several activities the generic icons earn their place,
    // because they are the only thing telling three rows of one item apart.
    img: multiple ? (activity.img || item.img) : item.img,

    toHit: labels.toHit ?? null,

    // Formulas rather than dnd5e's full damage labels: "1d10 + 3" fits a phone
    // row where "1d10 + 3 Piercing" does not, and the damage type is in the
    // chat card a tap later.
    damage: (labels.damages ?? []).map(d => d.formula).filter(Boolean).join(" + ") || null,

    range: labels.range ?? null,

    // Uses live on the item, not the activity — that is what makes Channel
    // Divinity's three activities share one pool, and it means the counter has
    // to be read from the item even though the row is an activity.
    uses: (uses.max > 0) ? { value: uses.value ?? 0, max: uses.max } : null,
    spent: (uses.max > 0) && ((uses.value ?? 0) <= 0),

    // Redundant inside its own group, where the heading already says it, but
    // the "other" group has no single activation to put in a heading.
    activation: labels.activation ?? null,

    // What kind of thing this is — a weapon, a class feature, a consumable.
    // Carried as both a key for the stripe colour and a word for the row,
    // following the same rule as the spell source stripes: the colour says
    // there is a distinction, the word says which, and a colour on its own
    // would be a code the player has to learn.
    itemType: item.type,
    typeLabel: typeLabels[item.type] ?? null,

    // How many separate stacks were folded into this row, and whether any
    // were. See `mergeEntries`.
    stacks: 1,
    merged: false,

    /*
     * What counts as "the same row" when the character carries duplicates.
     *
     * Two flasks of holy water are two items with their own charges, and they
     * arrive as two identical rows. Identity is the compendium the item came
     * from where that is recorded, because that is what actually makes two
     * items the same thing; the name is the fallback for anything created by
     * hand. The activity name is part of the key so a merge never collapses
     * two different things one item can do.
     */
    mergeKey: [
      item._stats?.compendiumSource ?? item.name,
      activity.name ?? activity.id
    ].join("::")
  };
}

/**
 * Describe a cross-listed spell as a row.
 *
 * One row per spell rather than one per activity, unlike `describeActivity`.
 * That is a deliberate difference, not an oversight: a multi-activity feature
 * like Channel Divinity offers the player a real choice between activities,
 * which is exactly what giving each its own row is for. Divine Smite's four
 * activities are not that — they are two tiers paired with their own internal
 * plumbing — and dnd5e already knows how to resolve a spell's own activity
 * when there is more than one to choose from. Routing the tap through
 * `castSpell`, the same action the spells screen uses, rather than through
 * `useActivity`, is what lets it lean on that instead of guessing.
 *
 * @param {object} item      A spell item.
 * @param {object} activity  The activity `qualifyingSpellActivity` found —
 *                           read for its numbers, not used to dispatch the tap.
 * @param {object} [typeLabels]
 * @returns {object}
 */
export function describeSpellAction(item, activity, typeLabels = {}) {
  const labels = activity.labels ?? {};

  // Uses live on the item, same as `describeActivity` reads them — Divine
  // Smite really does carry a limited-use pool here, not just a spell slot.
  const uses = item.system?.uses ?? {};

  return {
    key: `spell.${item.id}.${activity.id}`,
    itemId: item.id,
    activityId: null,
    spellId: item.id,
    action: "castSpell",

    // True for an attack cantrip. Safe to mark here unlike the comment on
    // `describeActivity` warned against: `castSpell` now gives an attack
    // cantrip the same `rollAttack`-with-suppressed-dialog treatment
    // `useActivity` gives a weapon, so the tint is no longer a row promising
    // something the tap does not do.
    attack: activity.type === "attack",

    name: item.name,
    subtitle: null,
    img: item.img,

    toHit: labels.toHit ?? null,
    damage: (labels.damages ?? []).map(d => d.formula).filter(Boolean).join(" + ") || null,
    range: labels.range ?? null,

    uses: (uses.max > 0) ? { value: uses.value ?? 0, max: uses.max } : null,
    spent: (uses.max > 0) && ((uses.value ?? 0) <= 0),

    activation: labels.activation ?? null,

    itemType: item.type,
    typeLabel: typeLabels[item.type] ?? null,

    stacks: 1,
    merged: false,
    mergeKey: `spell::${item.id}`
  };
}

/* -------------------------------------------- */

/**
 * Fold duplicate stacks of the same item into one row.
 *
 * A character carrying two flasks of holy water has two items, each with its
 * own charge, and listing both is accurate and useless: two identical rows read
 * as a bug, and on a phone they cost a screen's worth of space that a fight
 * needs for something else.
 *
 * The charges are summed, so the row says how many throws are left rather than
 * how the pack is organised. What the tap spends is the first stack that still
 * has one — which is what makes the second flask reachable at all once the
 * first is empty, without the player having to know there is a second.
 *
 * @param {object[]} entries
 * @returns {object[]}
 */
export function mergeEntries(entries) {
  const merged = new Map();

  /*
   * Whether the stack a row currently points at is empty.
   *
   * Tracked apart from the row's own `spent`, which after summing describes the
   * whole pile rather than the one stack the tap would reach. Conflating the
   * two leaves the tap on an empty flask while a full one sits behind it —
   * exactly the failure merging is supposed to remove.
   */
  const pointerSpent = new Map();

  for ( const entry of entries ) {
    const existing = merged.get(entry.mergeKey);

    if ( !existing ) {
      merged.set(entry.mergeKey, { ...entry });
      pointerSpent.set(entry.mergeKey, entry.spent);
      continue;
    }

    existing.stacks += 1;
    existing.merged = true;

    if ( pointerSpent.get(entry.mergeKey) && !entry.spent ) {
      existing.itemId = entry.itemId;
      existing.activityId = entry.activityId;
      existing.spellId = entry.spellId;
      existing.action = entry.action;
      existing.key = entry.key;
      pointerSpent.set(entry.mergeKey, false);
    }

    if ( existing.uses && entry.uses ) {
      existing.uses = {
        value: existing.uses.value + entry.uses.value,
        max: existing.uses.max + entry.uses.max
      };
    }

    // Spent only once every stack is, which is what the summed counter says.
    existing.spent = existing.uses ? (existing.uses.value <= 0) : (existing.spent && entry.spent);
  }

  return [...merged.values()];
}

/* -------------------------------------------- */

/**
 * Group activities by activation type, in turn order.
 *
 * @param {object[]} items      The actor's items.
 * @param {object} config       `CONFIG.DND5E`.
 * @param {object} [typeLabels] Item type names, as `CONFIG.Item.typeLabels`.
 * @returns {object[]}
 */
export function buildActionGroups(items = [], config = {}, typeLabels = {}) {
  const groups = new Map();

  for ( const item of items ) {
    // Spells take their own path through this loop: one row for the single
    // activity that earned the spell its place, rather than one per activity
    // the way a feature does. See `qualifyingSpellActivity` for why.
    const spellActivity = qualifyingSpellActivity(item, config);
    if ( spellActivity ) {
      const group = spellActivity.activation?.type || OTHER_GROUP;
      if ( !groups.has(group) ) groups.set(group, []);
      groups.get(group).push(describeSpellAction(item, spellActivity, typeLabels));
      continue;
    }

    if ( !itemOffersActions(item) ) continue;

    const activities = item.system.activities.contents;

    for ( const activity of activities ) {
      const type = activity.activation?.type ?? "";
      if ( isPassiveActivation(type, config) ) continue;

      const group = type || OTHER_GROUP;
      if ( !groups.has(group) ) groups.set(group, []);
      groups.get(group).push(describeActivity(activity, item, activities.length > 1, typeLabels));
    }
  }

  return [...groups.entries()]
    .sort(([a], [b]) => rank(a) - rank(b))
    .map(([type, entries]) => ({
      type,
      label: groupLabel(type, config),

      // The template needs to know which group is the catch-all, because it is
      // the only one whose heading does not already name the activation.
      other: type === OTHER_GROUP,

      // By kind first, then alphabetically inside each kind. Purely
      // alphabetical put a tool at the top of a fight's list and scattered the
      // weapons through the features; grouping by kind makes the list read as
      // blocks that match the stripe colours, with attacks where a fight needs
      // them. Alphabetical within a kind keeps the order stable, so muscle
      // memory survives picking up a new item.
      entries: mergeEntries(entries)
        .sort((a, b) => (typeRank(a.itemType) - typeRank(b.itemType)) || a.name.localeCompare(b.name))
    }));
}

/**
 * Where an activation type sorts. Unknown types go last, in a stable order.
 *
 * @param {string} type
 * @returns {number}
 */
function rank(type) {
  const index = GROUP_ORDER.indexOf(type);
  return (index === -1) ? GROUP_ORDER.length : index;
}

/**
 * Where an item type sorts within a group. Unknown types go last.
 *
 * @param {string} type
 * @returns {number}
 */
function typeRank(type) {
  const index = TYPE_ORDER.indexOf(type);
  return (index === -1) ? TYPE_ORDER.length : index;
}

/**
 * The heading for a group.
 *
 * dnd5e's config carries two strings per activation type: `label` is singular
 * and names one activation, `header` is the plural used as a heading. Preferred
 * in that order, because `header` is absent on some types.
 *
 * @param {string} type
 * @param {object} config
 * @returns {string}
 */
function groupLabel(type, config) {
  if ( type === OTHER_GROUP ) return "PHONEDRY.Actions.Other";

  const entry = config.activityActivationTypes?.[type] ?? {};
  return entry.header ?? entry.label ?? type;
}

/* -------------------------------------------- */

/**
 * Build the whole actions view model.
 *
 * @param {object} actor        An actor-shaped object.
 * @param {object} config       `CONFIG.DND5E`.
 * @param {object} [typeLabels] Item type names, as `CONFIG.Item.typeLabels`.
 * @returns {object}
 */
export function buildActionsView(actor, config, typeLabels) {
  const groups = buildActionGroups(actor.items ?? [], config, typeLabels);
  return { groups, empty: groups.length === 0 };
}
