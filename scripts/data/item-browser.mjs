/**
 * Searching the compendium for gear to pick up.
 *
 * The counterpart to the spell browser, sharing its generic half from
 * `browser.mjs` — folding a query, dropping duplicate copies, capping the
 * results. Pure and synchronous like the other mappers, and working on
 * compendium index entries rather than documents.
 *
 * The difference that matters is scale. A cleric's spell list is 226 entries;
 * the gear packs in a world with the Player's Handbook and Dungeon Master's
 * Guide installed hold over two thousand between them, most of them duplicated
 * across rules versions. Search is the only way in, and the deduplication does
 * more work here than it does for spells.
 */

import { dedupeByName, dedupeEntries, fold, MAX_RESULTS } from "./browser.mjs";

/**
 * Item types that belong on the inventory screen.
 *
 * A list of names rather than the capability check `data/inventory.mjs` uses,
 * and for a reason worth stating: a compendium *index* carries no system data,
 * so `system.quantity` is not there to ask about. The types are the only thing
 * available at this stage, and they are dnd5e's own physical set.
 *
 * The consequence is that a future physical item type appears on the inventory
 * screen automatically but has to be added here by hand. That is the right way
 * round — the sheet never hides something a character already owns.
 */
export const PHYSICAL_TYPES = new Set([
  "weapon", "equipment", "consumable", "tool", "loot", "container"
]);

/**
 * How results can be ordered.
 *
 * Two orders rather than the spell browser's three. Name is how someone shops
 * for a thing they can name, and kind is how someone browses for a thing they
 * cannot — "show me the weapons". Rarity was considered and left out: it sorts
 * a list of two thousand mundane items behind six magical ones, which is not a
 * view anybody wanted.
 */
export const ITEM_SORTS = { NAME: "name", TYPE: "type" };

/**
 * The order kinds of thing appear in.
 *
 * The same order the inventory and actions screens use, so a list sorted by
 * kind reads the same way wherever it is met.
 */
const TYPE_ORDER = ["weapon", "equipment", "consumable", "tool", "loot", "container"];

/* -------------------------------------------- */

/**
 * Search entries by name.
 *
 * Substring rather than prefix matching, for the same reason as spells: "mail"
 * should find Chain Mail, and nobody thinks of an item by its first word.
 *
 * @param {object[]} entries
 * @param {object} [options]
 * @param {string} [options.query]      What was typed.
 * @param {string} [options.sort]       An ITEM_SORTS value.
 * @param {object} [options.labels]     `{ types, rarities }`, already localised.
 * @param {number} [options.limit]
 * @returns {{results: object[], total: number, truncated: boolean}}
 */
export function searchItems(entries, {
  query = "", sort = ITEM_SORTS.NAME, labels = {}, limit = MAX_RESULTS
} = {}) {
  const needle = fold(query.trim());

  /*
   * Both passes, in this order. The first drops a module's copy of the same
   * document; the second drops the same *thing* published under two rules
   * versions with different identifiers. Filtering first would be faster and
   * wrong: the copy that survives deduplication has to be chosen from all of
   * them, not from whichever happened to match.
   */
  const described = dedupeByName(dedupeEntries(entries))
    .filter(entry => !needle || fold(entry.name).includes(needle))
    .map(entry => describeEntry(entry, labels));

  described.sort(comparator(sort));

  return {
    total: described.length,
    truncated: described.length > limit,
    results: described.slice(0, limit)
  };
}

/**
 * Turn an index entry into a result row.
 *
 * There is deliberately no "already owned" marking, which is the one place this
 * departs from the spell browser. A character has one copy of Cure Wounds or
 * none, so saying which is useful; a character can perfectly well carry a
 * second rope, a third torch and seven more rations, so greying out what is
 * already in the pack would refuse the most ordinary thing this screen does.
 *
 * @param {object} entry
 * @param {object} labels
 * @returns {object}
 */
function describeEntry(entry, labels) {
  const rarity = entry.system?.rarity || null;

  return {
    id: entry._id,
    uuid: entry.uuid,
    name: entry.name,
    img: entry.img,

    itemType: entry.type,

    // Rarity is dnd5e's own marker for a magic item and the only thing on a row
    // that says this is out of the ordinary. Blank on almost everything, which
    // is what makes it worth showing where it is not.
    rarity,

    meta: [
      labels.types?.[entry.type] ?? entry.type,
      rarity ? (labels.rarities?.[rarity] ?? rarity) : null
    ].filter(Boolean).join(" · "),

    owned: false
  };
}

/**
 * A comparator for the chosen order.
 *
 * Both orders fall back to name, so the list is stable rather than reshuffling
 * within a kind each time it is built.
 *
 * @param {string} sort  An ITEM_SORTS value.
 * @returns {(a: object, b: object) => number}
 */
function comparator(sort) {
  const byName = (a, b) => a.name.localeCompare(b.name);

  if ( sort === ITEM_SORTS.TYPE ) {
    return (a, b) => (typeRank(a.itemType) - typeRank(b.itemType)) || byName(a, b);
  }

  return byName;
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
