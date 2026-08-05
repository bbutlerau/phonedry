/**
 * Searching the compendium for spells to add.
 *
 * Pure and synchronous, like the other mappers. The generic half of the job —
 * folding a query, dropping duplicate copies, capping the result count — lives
 * in `browser.mjs`, because the gear browser has exactly the same problem and
 * neither of them owns it.
 */

import { dedupeEntries, fold, MAX_RESULTS } from "./browser.mjs";

// Re-exported because they were part of this module's surface before the gear
// browser needed them too, and callers should not have to know which file a
// primitive was moved into.
export { dedupeEntries, fold, MAX_RESULTS };

/**
 * How results can be ordered.
 *
 * Level and school are only sortable because the boot path asks Foundry to
 * carry both in its compendium indexes — see `registerIndexFields`. Without
 * that they are absent, and fetching them costs a rebuild long enough to look
 * like a hang.
 */
export const SORTS = { NAME: "name", LEVEL: "level", SCHOOL: "school" };

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

    // The row's second line, composed here rather than in the template. The
    // gear browser shares that template and has entirely different things to
    // say on it, so the one thing they can agree on is a finished string.
    meta: [
      (level === null) ? null : (labels.levels?.[level] ?? String(level)),
      school ? (labels.schools?.[school]?.label ?? school) : null
    ].filter(Boolean).join(" · "),

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
