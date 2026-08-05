/**
 * Putting a compendium document onto a character.
 *
 * Shared by both browsers, because adding a spell and adding a coil of rope are
 * the same operation: read the source, copy it, record where it came from,
 * create it on the actor. Only the words differ, and those are the caller's.
 */

/**
 * Copy a compendium document onto an actor.
 *
 * @param {Actor} actor
 * @param {string} uuid          The compendium uuid.
 * @param {object} messages
 * @param {string} messages.added   Localisation key for the confirmation.
 * @param {string} messages.failed  Localisation key for the failure. Both are
 *   the caller's, because "spell" and "item" are the only difference between
 *   the two browsers a player ever sees.
 * @returns {Promise<Item|null>}
 */
export async function addFromCompendium(actor, uuid, { added, failed }) {
  try {
    const source = await fromUuid(uuid);
    if ( !source ) throw new Error(`Nothing found at ${uuid}`);

    const data = source.toObject();

    /*
     * Record where it came from. Creating from compendium data does not carry
     * this across on its own, and without it the copy has no provenance: the
     * spell browser would offer a spell again as though the character did not
     * have it, and the inventory screen could not tell two flasks bought
     * together apart from two unrelated ones — which is what its merging of
     * duplicate stacks depends on.
     */
    foundry.utils.setProperty(data, "_stats.compendiumSource", uuid);

    const [created] = await actor.createEmbeddedDocuments("Item", [data]);

    ui.notifications?.info(game.i18n.format(added, { name: source.name }));
    return created;
  } catch ( error ) {
    console.error("phonedry | could not add from compendium", error);
    ui.notifications?.error(game.i18n.localize(failed));
    return null;
  }
}
