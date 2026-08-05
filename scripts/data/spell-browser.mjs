/**
 * Searching the compendium for spells to add.
 *
 * Pure and synchronous, like the other mappers. What it works on is compendium
 * *index* entries — `{ _id, name, img, uuid, pack }` — rather than documents.
 * That distinction is the whole performance story of this screen: the indexes
 * dnd5e has already built are in memory and free to search, while loading the
 * documents behind them is not.
 */

/**
 * How many results to show at once.
 *
 * A cleric's list is 226 spells and every row is a DOM node with an image. The
 * cap is not about the list being unreadable — it is about not building two
 * hundred rows on a phone between keystrokes. Anyone looking for a specific
 * spell types two more letters; anyone browsing is served fine by the first
 * page.
 */
export const MAX_RESULTS = 60;

/**
 * How results can be ordered.
 *
 * Level and school are only sortable because the boot path asks Foundry to
 * carry both in its compendium indexes — see `registerIndexFields`. Without
 * that they are absent, and fetching them costs a rebuild long enough to look
 * like a hang.
 */
export const SORTS = { NAME: "name", LEVEL: "level", SCHOOL: "school" };

/**
 * Fold a string for comparison: lower case, accents removed.
 *
 * Without the accent handling, searching "faerie" would miss nothing but
 * searching for a spell with a diacritic in its name would need the player to
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

/* -------------------------------------------- */

/**
 * Remove entries that are the same spell from a different compendium.
 *
 * Every spell in this world appears twice: once in dnd5e's own pack and once in
 * the Player's Handbook module, sharing an identifier. Offering both is the
 * exact confusion the source stripes exist to resolve, arriving one step
 * earlier — two identical rows with no way to tell them apart.
 *
 * Where there is a choice, the entry from outside the core compendium wins. A
 * premium module carries the full text and artwork, and it is where the
 * character's existing spells came from, so matching it keeps a sheet
 * internally consistent.
 *
 * @param {object[]} entries
 * @returns {object[]}
 */
export function dedupeEntries(entries) {
  const byId = new Map();

  for ( const entry of entries ) {
    const existing = byId.get(entry._id);
    if ( !existing ) {
      byId.set(entry._id, entry);
      continue;
    }

    const existingIsCore = existing.pack?.startsWith("dnd5e.");
    if ( existingIsCore && !entry.pack?.startsWith("dnd5e.") ) byId.set(entry._id, entry);
  }

  return [...byId.values()];
}

/* -------------------------------------------- */

/**
 * Search entries by name.
 *
 * Substring rather than prefix matching: "wounds" should find Cure Wounds, and
 * a player thinking of a spell rarely starts from its first word.
 *
 * @param {object[]} entries
 * @param {object} [options]
 * @param {string} [options.query]       What was typed.
 * @param {Set<string>} [options.owned]  Ids the character already has.
 * @param {string} [options.sort]        A SORTS value.
 * @param {object} [options.labels]      `{ levels, schools }` from CONFIG.DND5E.
 * @param {number} [options.limit]
 * @returns {{results: object[], total: number, truncated: boolean}}
 */
export function searchSpells(entries, {
  query = "", owned = new Set(), sort = SORTS.NAME, labels = {}, limit = MAX_RESULTS
} = {}) {
  const needle = fold(query.trim());

  const described = dedupeEntries(entries)
    .filter(entry => !needle || fold(entry.name).includes(needle))
    .map(entry => describeEntry(entry, labels, owned));

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
 * @param {object} entry
 * @param {object} labels
 * @param {Set<string>} owned
 * @returns {object}
 */
function describeEntry(entry, labels, owned) {
  const level = entry.system?.level ?? null;
  const school = entry.system?.school ?? null;

  return {
    id: entry._id,
    uuid: entry.uuid,
    name: entry.name,
    img: entry.img,

    level,
    school,
    levelLabel: (level === null) ? null : (labels.levels?.[level] ?? String(level)),
    schoolLabel: school ? (labels.schools?.[school]?.label ?? school) : null,

    // Already on the sheet. Shown rather than filtered out, because a player
    // searching for a spell they already have wants to be told that, not left
    // wondering whether the search is broken.
    owned: owned.has(entry._id)
  };
}

/**
 * A comparator for the chosen order.
 *
 * Every order falls back to name, so the list is stable and predictable rather
 * than reshuffling within a level each time it is built.
 *
 * @param {string} sort  A SORTS value.
 * @returns {(a: object, b: object) => number}
 */
function comparator(sort) {
  const byName = (a, b) => a.name.localeCompare(b.name);

  if ( sort === SORTS.LEVEL ) {
    // Nulls last: a spell whose level is unknown belongs at the end rather than
    // sorted in among the cantrips as though it were one.
    return (a, b) => ((a.level ?? Infinity) - (b.level ?? Infinity)) || byName(a, b);
  }

  if ( sort === SORTS.SCHOOL ) {
    return (a, b) => (a.schoolLabel ?? "").localeCompare(b.schoolLabel ?? "") || byName(a, b);
  }

  return byName;
}
