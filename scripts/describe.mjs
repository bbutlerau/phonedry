/**
 * Reading an item's description.
 *
 * The description is authored HTML with Foundry's own markup inside it —
 * `[[/damage 2d6]]`, `@UUID[...]{Fireball}`, `&Reference[condition]` — none of
 * which means anything until it is enriched. Enrichment is what turns those
 * into readable text, so it is not an optional nicety: skipped, a spell
 * description reads as a page of markup.
 */

/**
 * Prepare an item's description for display.
 *
 * @param {Item} item
 * @returns {Promise<{name: string, img: string, subtitle: string|null, html: string}|null>}
 */
export async function describeItem(item) {
  if ( !item ) return null;

  const { TextEditor } = foundry.applications.ux;
  const source = item.system?.description?.value ?? "";

  let html = "";
  try {
    html = await TextEditor.implementation.enrichHTML(source, {
      // Roll data so inline formulas resolve against this character rather than
      // showing as raw references.
      rollData: item.getRollData?.() ?? {},
      relativeTo: item,

      // GM-only notes stay hidden. A player holding their own spell should see
      // the spell, not whatever the GM wrote in the margin of it.
      secrets: false
    });
  } catch ( error ) {
    console.error("phonedry | could not enrich description", error);
    html = source;
  }

  return {
    name: item.name,
    img: item.img,

    // dnd5e composes this for the item type it is — "1st Level Evocation" for a
    // spell, a rarity and type for equipment — so there is nothing to assemble.
    subtitle: item.system?.labels?.level
      ?? item.labels?.level
      ?? item.labels?.school
      ?? null,

    html
  };
}
