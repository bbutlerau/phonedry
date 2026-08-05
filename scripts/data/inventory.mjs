/**
 * The actor → view model mapper for the inventory screen.
 *
 * Pure and synchronous like the other mappers, for the same reason: this is the
 * layer that breaks when dnd5e moves a field, and it can only be cheaply tested
 * if it depends on nothing.
 *
 * The screen exists because the actions tab created a hole. That screen filters
 * weapons on `system.equipped`, so a player who draws a different weapon
 * mid-fight has no way to make it appear — the sheet showed them what they
 * could do and gave them no way to change it. Equipping is the load-bearing
 * feature here; currency, encumbrance and attunement come with the same screen
 * because they answer the other questions asked while looking through a pack.
 *
 * The organising principle is **where a thing is**, not what kind of thing it
 * is. A character carrying two lamps — one in hand and one at the bottom of the
 * Priest's Pack — gets two rows either way, and grouping by type puts them side
 * by side as an unexplained duplicate. Grouping by container answers the
 * question actually being asked, which is "where is my lamp".
 */

/** The group holding everything not inside a container. */
export const CARRIED = "carried";

/**
 * The order kinds of thing appear in within a group.
 *
 * The same order the actions screen uses, and for the same reason: what a fight
 * reaches for soonest goes highest, and a consistent order between the two
 * screens means muscle memory built on one works on the other. Containers sort
 * last because they head their own group further down, so their row here is a
 * signpost rather than a destination.
 *
 * An item type not listed sorts to the end rather than disappearing.
 */
const TYPE_ORDER = ["weapon", "equipment", "consumable", "tool", "loot", "container"];

/* -------------------------------------------- */

/**
 * Is this something the character physically carries?
 *
 * Detected by capability rather than by a list of type names: dnd5e gives every
 * physical item a quantity through its `PhysicalItemTemplate`, and nothing else
 * has one. A future item type that is carried therefore appears here without
 * this file needing to hear about it, which a hard-coded list would not manage.
 *
 * @param {object} item
 * @returns {boolean}
 */
export function isPhysical(item) {
  return item?.system?.quantity !== undefined;
}

/**
 * Can this item be equipped?
 *
 * The same test dnd5e's own context menu uses. Equippability is a property of
 * the item's data model — weapons, equipment, tools, consumables and containers
 * mix in `EquippableItemTemplate` and loot does not — so asking whether the
 * field exists is asking the schema directly.
 *
 * @param {object} item
 * @returns {boolean}
 */
export function isEquippable(item) {
  return (item?.system !== undefined) && ("equipped" in item.system);
}

/* -------------------------------------------- */

/**
 * Describe one item as a row.
 *
 * @param {object} item     An item, as dnd5e prepares it.
 * @param {object} config   `CONFIG.DND5E`.
 * @param {object} [typeLabels]  Item type names, as `CONFIG.Item.typeLabels`.
 * @returns {object}
 */
export function describeItem(item, config = {}, typeLabels = {}) {
  const system = item.system ?? {};
  const quantity = system.quantity ?? 1;
  const units = system.weight?.units;

  return {
    id: item.id,
    name: item.name,
    img: item.img,

    itemType: item.type,
    typeLabel: typeLabels[item.type] ?? null,

    // Equipping and attuning are separate states with separate rules — a shield
    // is equipped and not attuned, a magic amulet may be attuned while stowed —
    // so the row carries both rather than collapsing them into "in use".
    equippable: isEquippable(item),
    equipped: !!system.equipped,

    // dnd5e records attunement as "required", "optional" or an empty string,
    // and whether it is actually attuned as a separate boolean. Only items that
    // say something about attunement get the control; giving one to a mundane
    // rope would be a dead button with no tooltip to explain it.
    attunable: !!system.attunement,
    attuned: !!system.attuned,
    attunementRequired: system.attunement === "required",

    quantity,

    // The weight of the whole stack, which is what encumbrance is counted in
    // and therefore what the player is looking for. Three flasks at 1lb each is
    // 3lb of the answer to "what do I put down", and per-item weight is not.
    weight: (system.weight?.value > 0)
      ? {
        value: round(quantity * system.weight.value),
        units: config.weightUnits?.[units]?.abbreviation ?? units ?? null
      }
      : null,

    // Rarity is dnd5e's own marker for a magic item, and the only cheap signal
    // on this screen that something is out of the ordinary. Blank on everything
    // mundane, which is most of a pack.
    rarity: system.rarity || null,

    // A container heads its own group, so its row needs to say so.
    container: item.type === "container"
  };
}

/**
 * Round a weight to one decimal place.
 *
 * dnd5e's own sheet does the same before displaying. Without it a stack of
 * seven quarter-pound items reads as 1.7500000000000002.
 *
 * @param {number} value
 * @returns {number}
 */
function round(value) {
  return Math.round(value * 10) / 10;
}

/* -------------------------------------------- */

/**
 * Group the character's belongings by where they are.
 *
 * @param {object[]} items       The actor's items.
 * @param {object} config        `CONFIG.DND5E`.
 * @param {object} [typeLabels]  Item type names, as `CONFIG.Item.typeLabels`.
 * @returns {object[]}
 */
export function buildItemGroups(items = [], config = {}, typeLabels = {}) {
  const physical = items.filter(isPhysical);

  /*
   * Contents are collected against the container's id rather than by walking
   * each container, because `system.contents` on a real container is a lazily
   * built Collection and reaching into it would make this mapper depend on
   * Foundry. The child knows its parent in `system.container`, which is plain
   * data, so one pass over the list is enough.
   */
  const byContainer = new Map();
  for ( const item of physical ) {
    const key = item.system.container ?? CARRIED;
    if ( !byContainer.has(key) ) byContainer.set(key, []);
    byContainer.get(key).push(describeItem(item, config, typeLabels));
  }

  const containers = physical.filter(item => item.type === "container");

  /*
   * A container appears exactly once, as the heading of its own group. Listing
   * it as a row in the carried list as well would be honest and confusing: the
   * player would see "Priest's Pack" twice and have to work out that one of
   * them is the pack and the other is the pack's label.
   */
  const containerIds = new Set(containers.map(item => item.id));
  const carried = (byContainer.get(CARRIED) ?? []).filter(entry => !containerIds.has(entry.id));

  const groups = [];

  // Loose items first: what is in hand is reached for before what is packed.
  // The group is kept even when empty as long as anything else exists, because
  // an inventory whose first heading is "Priest's Pack" reads as though the
  // character is carrying nothing of their own.
  if ( carried.length || containers.length ) {
    groups.push({
      key: CARRIED,
      label: "PHONEDRY.Items.Carried",
      container: null,
      entries: sortEntries(carried)
    });
  }

  // Then one group per container, alphabetically — the order is arbitrary but
  // it has to be stable, or a pack moves under the player between renders.
  for ( const item of [...containers].sort((a, b) => a.name.localeCompare(b.name)) ) {
    const entries = sortEntries(byContainer.get(item.id) ?? []);
    const row = describeItem(item, config, typeLabels);

    groups.push({
      key: item.id,
      label: item.name,

      /*
       * The heading carries the container's own row — its artwork, its equip
       * toggle, and the weight of everything inside it. That is what lets a
       * backpack be taken off without giving it a second row somewhere else,
       * and it puts the number a player wants ("what is this pack costing me")
       * beside the name of the pack rather than three screens away.
       */
      container: { ...row, weight: totalWeight(row, entries) },
      entries
    });
  }

  return groups;
}

/**
 * The weight of a container and everything in it.
 *
 * Computed here rather than read from dnd5e's `totalWeight`, which returns a
 * promise for a container in a compendium — a mapper that awaited anything
 * could not be called from `_prepareContext` synchronously, and the arithmetic
 * is a sum rather than a rule.
 *
 * Contents inside a *nested* container are counted through that container's own
 * row, which is itself an entry here, so nothing is missed and nothing is
 * counted twice.
 *
 * @param {object} row        The container's own row.
 * @param {object[]} entries  Its contents.
 * @returns {{value: number, units: string}|null}
 */
function totalWeight(row, entries) {
  const units = row.weight?.units ?? entries.find(e => e.weight)?.weight?.units ?? null;
  const total = round(entries.reduce((sum, e) => sum + (e.weight?.value ?? 0), row.weight?.value ?? 0));

  return total > 0 ? { value: total, units } : null;
}

/**
 * Order rows within a group: by kind, then by name.
 *
 * The same rule as the actions screen. Purely alphabetical scattered the
 * weapons through the rations; grouping by kind makes a list read as blocks,
 * with the things a fight reaches for at the top of each pile.
 *
 * @param {object[]} entries
 * @returns {object[]}
 */
function sortEntries(entries) {
  return [...entries].sort((a, b) =>
    (typeRank(a.itemType) - typeRank(b.itemType)) || a.name.localeCompare(b.name));
}

/**
 * Where an item type sorts. Unknown types go last.
 *
 * @param {string} type
 * @returns {number}
 */
function typeRank(type) {
  const index = TYPE_ORDER.indexOf(type);
  return (index === -1) ? TYPE_ORDER.length : index;
}

/* -------------------------------------------- */

/**
 * What the character is carrying in coin.
 *
 * Only denominations actually held are listed. A row of five zeroes is noise on
 * a screen with none to spare, and a denomination appears the moment any of it
 * is picked up — which is the only time it matters.
 *
 * @param {object} currency  `actor.system.currency`.
 * @param {object} config    `CONFIG.DND5E`.
 * @returns {object[]}
 */
export function buildCurrency(currency = {}, config = {}) {
  return Object.entries(config.currencies ?? {})
    .filter(([key]) => (currency[key] ?? 0) > 0)
    .map(([key, denomination]) => ({
      key,
      value: currency[key],
      label: denomination.abbreviation ?? denomination.label ?? key
    }));
}

/* -------------------------------------------- */

/**
 * How loaded down the character is.
 *
 * Deliberately two states rather than four. dnd5e knows three thresholds, but
 * *encumbered* and *heavily encumbered* only apply under the optional variant
 * rule — its own `_getStatusEffects` guards both on that setting and leaves
 * exceeding carrying capacity unguarded. Showing all three unconditionally
 * would be telling a player they are slowed by a rule their table may not be
 * playing, which is worse than saying less.
 *
 * @param {object} encumbrance  `actor.system.attributes.encumbrance`.
 * @param {object} config       `CONFIG.DND5E`.
 * @returns {object|null}
 */
export function buildEncumbrance(encumbrance, config = {}) {
  const max = encumbrance?.max;
  if ( !Number.isFinite(max) || (max <= 0) ) return null;

  const value = encumbrance.value ?? 0;
  const units = encumbrance.units;

  return {
    value: round(value),
    max: round(max),

    // Clamped, because the bar is a bar: past capacity there is nothing further
    // for it to say, and the number beside it is what carries the overage.
    pct: Math.min(100, Math.round((value / max) * 100)),

    // The one carrying rule that applies whatever variant is in play.
    over: value > (encumbrance.thresholds?.maximum ?? max),

    units: config.weightUnits?.[units]?.abbreviation ?? units ?? null
  };
}

/* -------------------------------------------- */

/**
 * Build the whole inventory view model.
 *
 * @param {object} actor         An actor-shaped object.
 * @param {object} config        `CONFIG.DND5E`.
 * @param {object} [typeLabels]  Item type names, as `CONFIG.Item.typeLabels`.
 * @returns {object}
 */
export function buildInventoryView(actor, config = {}, typeLabels = {}) {
  const attributes = actor?.system?.attributes ?? {};
  const groups = buildItemGroups(actor?.items ?? [], config, typeLabels);
  const attunement = attributes.attunement ?? {};

  return {
    groups,
    currency: buildCurrency(actor?.system?.currency, config),
    encumbrance: buildEncumbrance(attributes.encumbrance, config),

    /*
     * Attunement is shown as a count rather than enforced. dnd5e does not stop
     * a fourth attunement either — it counts them and leaves the rule to the
     * table — and a sheet that refused the tap would be enforcing something the
     * system does not, with a GM's ruling on the other side of it.
     */
    attunement: (attunement.max > 0)
      ? { value: attunement.value ?? 0, max: attunement.max, over: (attunement.value ?? 0) > attunement.max }
      : null,

    empty: groups.length === 0
  };
}
