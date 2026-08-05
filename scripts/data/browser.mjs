/**
 * The parts of a compendium search that are not about spells or about items.
 *
 * Two screens browse a compendium — spells to learn, gear to pick up — and they
 * differ only in where the entries come from and what a row says. Everything
 * else is the same problem: fold a query, drop the copies, cap the results.
 *
 * Pure and synchronous, like the other mappers. What all of this works on is
 * compendium *index* entries — `{ _id, name, img, uuid, pack, type }` — rather
 * than documents. That distinction is the whole performance story of these
 * screens: the indexes Foundry has already built are in memory and free to
 * search, while loading the documents behind them is not.
 */

/**
 * How many results to show at once.
 *
 * A cleric's spell list is 226 entries and the gear packs together hold over two
 * thousand. Every row is a DOM node with an image, so the cap is not about the
 * list being unreadable — it is about not building hundreds of rows on a phone
 * between keystrokes. Anyone looking for something specific types two more
 * letters; anyone browsing is served fine by the first page.
 */
export const MAX_RESULTS = 60;

/**
 * Fold a string for comparison: lower case, accents removed.
 *
 * Without the accent handling, searching "faerie" would miss nothing but
 * searching for something with a diacritic in its name would need the player to
 * produce that diacritic on a phone keyboard.
 *
 * @param {string} value
 * @returns {string}
 */
export function fold(value) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/**
 * Is this entry from one of dnd5e's own packs rather than from a module?
 *
 * @param {object} entry
 * @returns {boolean}
 */
function isCore(entry) {
  return !!entry?.pack?.startsWith("dnd5e.");
}

/* -------------------------------------------- */

/**
 * Remove entries that are the same document from a different compendium.
 *
 * Every spell in a world with the Player's Handbook module installed appears
 * twice — once in dnd5e's own pack and once in the module's, sharing an
 * identifier. Offering both is two identical rows with no way to tell them
 * apart.
 *
 * Where there is a choice, the entry from outside the core compendium wins. A
 * premium module carries the full text and artwork, and it is where the
 * character's existing items came from, so matching it keeps a sheet internally
 * consistent.
 *
 * @param {object[]} entries
 * @returns {object[]}
 */
export function dedupeEntries(entries) {
  return dedupeBy(entries, entry => entry._id);
}

/**
 * Remove entries that are the same *thing* under a different identifier.
 *
 * A second pass, and a stronger claim than the one above. Gear is published
 * under both rules versions — dnd5e ships a 2014 `items` pack and a 2024
 * `equipment24` pack — and the same chain mail carries a different id in each.
 * Deduplicating by identifier leaves both, and a search for "chain mail" then
 * returns four rows that a player has no way to choose between.
 *
 * Names are compared folded, so case and accents do not split a pair. The same
 * preference applies: a module's copy beats the core one.
 *
 * This is deliberately not applied to spells. Their lists come from dnd5e's own
 * registry, which already answers per class, and a spell appearing twice there
 * is the id-level duplicate above rather than a rules-version pair.
 *
 * @param {object[]} entries
 * @returns {object[]}
 */
export function dedupeByName(entries) {
  return dedupeBy(entries, entry => fold(entry.name));
}

/**
 * Keep one entry per key, preferring a module's copy over dnd5e's own.
 *
 * @param {object[]} entries
 * @param {(entry: object) => string} keyOf
 * @returns {object[]}
 */
function dedupeBy(entries, keyOf) {
  const kept = new Map();

  for ( const entry of entries ) {
    const key = keyOf(entry);
    const existing = kept.get(key);

    if ( !existing || (isCore(existing) && !isCore(entry)) ) kept.set(key, entry);
  }

  return [...kept.values()];
}
