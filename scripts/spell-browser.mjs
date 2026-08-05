/**
 * Getting spells out of the compendium and onto a character.
 *
 * The question "which spells can this character take?" is a rules question, and
 * dnd5e answers it: `dnd5e.registry.spellLists` holds the spell list for every
 * class, populated from whichever compendium modules are installed. Phonedry
 * asks rather than curating a list of its own, which is what makes this work
 * with the Player's Handbook module, homebrew packs, or nothing at all.
 */

import { dedupeEntries } from "./data/spell-browser.mjs";

/**
 * The spell list identifiers to offer this character.
 *
 * Their classes, in the order the actor reports them. A multiclass character
 * gets both lists merged, which is the same thing their sheet does on a
 * desktop.
 *
 * @param {Actor} actor
 * @returns {string[]}
 */
function spellListKeys(actor) {
  return Object.values(actor.classes ?? {})
    .map(cls => cls.system?.identifier)
    .filter(Boolean)
    .map(identifier => `class:${identifier}`);
}

/**
 * Index entries for every spell this character's classes can learn.
 *
 * Reads the indexes dnd5e has already built rather than loading documents.
 * Those indexes carry a name, an image and a uuid — enough to search and to
 * show a row — and cost nothing, where loading two hundred spell documents on a
 * phone would be the most expensive thing this module does.
 *
 * Levels are deliberately absent, and that is the reason there is no level
 * filter on this screen. They are not in the index Foundry builds by default,
 * and asking for them costs a re-index measured at about ten seconds in the
 * development world — long enough that a player would think the sheet had hung.
 * Search by name is instant and is what someone reaches for anyway.
 *
 * @param {Actor} actor
 * @returns {object[]}
 */
export function getAvailableSpells(actor) {
  const registry = globalThis.dnd5e?.registry?.spellLists;
  if ( !registry ) return [];

  const entries = [];
  for ( const key of spellListKeys(actor) ) {
    const list = registry.forType(key);
    if ( list?.indexes ) entries.push(...list.indexes);
  }

  return dedupeEntries(entries);
}

/**
 * The compendium ids of spells the character already has.
 *
 * Matched on the compendium id rather than the uuid, because the same spell
 * exists in more than one pack with the same id — a spell added from the
 * Player's Handbook module would otherwise look absent when the browser is
 * offering dnd5e's copy of it.
 *
 * @param {Actor} actor
 * @returns {Set<string>}
 */
export function ownedSpellIds(actor) {
  const ids = new Set();

  for ( const item of actor.items ) {
    if ( item.type !== "spell" ) continue;
    const source = item._stats?.compendiumSource;
    if ( source ) ids.add(source.split(".").at(-1));
  }

  return ids;
}

/**
 * Add a spell to the character.
 *
 * @param {Actor} actor
 * @param {string} uuid  The compendium uuid of the spell.
 * @returns {Promise<Item|null>}
 */
export async function addSpell(actor, uuid) {
  try {
    const source = await fromUuid(uuid);
    if ( !source ) throw new Error(`No spell found at ${uuid}`);

    const data = source.toObject();

    // Record where it came from. Creating from compendium data does not carry
    // this across on its own, and without it the spell has no provenance: the
    // browser would offer it again as though the character did not have it, and
    // nothing could say which compendium it came from.
    foundry.utils.setProperty(data, "_stats.compendiumSource", uuid);

    const [created] = await actor.createEmbeddedDocuments("Item", [data]);

    ui.notifications?.info(game.i18n.format("PHONEDRY.Spells.Added", { name: source.name }));
    return created;
  } catch ( error ) {
    console.error("phonedry | could not add spell", error);
    ui.notifications?.error(game.i18n.localize("PHONEDRY.Spells.AddFailed"));
    return null;
  }
}
