/**
 * Getting gear out of the compendium and onto a character.
 *
 * Unlike spells, there is no rules question here for dnd5e to answer. A cleric
 * may learn cleric spells and dnd5e keeps a registry saying which; anyone may
 * pick up a coil of rope, so the source is simply every item compendium the
 * world has, and the search is what narrows it.
 */

import { PHYSICAL_TYPES } from "./data/item-browser.mjs";
import { addFromCompendium } from "./compendium.mjs";

/**
 * Index entries for every item in every compendium the player can see.
 *
 * Reads the indexes Foundry has already built rather than loading documents.
 * They carry a name, an image, a type and a uuid — enough to search and to show
 * a row — and cost nothing, where loading two thousand item documents on a
 * phone would be the most expensive thing this module has ever done.
 *
 * `pack.visible` is the filter that matters, and it is not a nicety: a GM's
 * private homebrew pack is hidden from players in Foundry's own compendium
 * sidebar, and a phone client that listed its contents anyway would be handing
 * out something the GM chose to keep back.
 *
 * @returns {object[]}
 */
export function getAvailableItems() {
  const entries = [];

  for ( const pack of game.packs ?? [] ) {
    if ( (pack.metadata?.type !== "Item") || !pack.visible ) continue;

    for ( const entry of pack.index ) {
      // Feats, classes, subclasses and species live in Item packs too. Only
      // things a character physically carries belong on the inventory screen.
      if ( PHYSICAL_TYPES.has(entry.type) ) entries.push(entry);
    }
  }

  return entries;
}

/**
 * Add an item to the character.
 *
 * No check for whether they already have one, deliberately. A second rope and a
 * third torch are ordinary, and refusing them would break the most common use
 * of this screen. Where two stacks of the same thing do arrive, the inventory
 * and actions screens already know what to do with them.
 *
 * @param {Actor} actor
 * @param {string} uuid  The compendium uuid of the item.
 * @returns {Promise<Item|null>}
 */
export function addItem(actor, uuid) {
  return addFromCompendium(actor, uuid, {
    added: "PHONEDRY.Items.Added",
    failed: "PHONEDRY.Items.AddFailed"
  });
}
