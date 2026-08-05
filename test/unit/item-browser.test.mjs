/**
 * Tests for the gear browser's search.
 *
 * Run with `npm run test:unit`. What it works on is compendium index entries,
 * which are small enough to write out honestly — `{ _id, name, img, uuid, pack,
 * type, system }` is the whole shape, and these are the real packs from the
 * development world.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { ITEM_SORTS, PHYSICAL_TYPES, searchItems } from "../../scripts/data/item-browser.mjs";
import { dedupeByName, dedupeEntries, fold } from "../../scripts/data/browser.mjs";

/** Item type names and rarities, already localised as they reach the mapper. */
const LABELS = {
  types: { weapon: "Weapon", equipment: "Equipment", consumable: "Consumable" },
  rarities: { rare: "Rare", uncommon: "Uncommon" }
};

/**
 * A compendium index entry.
 *
 * @param {object} [overrides]
 * @returns {object}
 */
function entry({ id = "a1", name = "Chain Mail", type = "equipment", pack = "dnd5e.items", rarity } = {}) {
  return {
    _id: id,
    name,
    type,
    pack,
    img: "icons/svg/item-bag.svg",
    uuid: `Compendium.${pack}.Item.${id}`,
    system: rarity ? { rarity } : {}
  };
}

/* -------------------------------------------- */

describe("PHYSICAL_TYPES", () => {
  it("covers what a character carries and nothing else", () => {
    // A compendium index has no system data, so the capability check the
    // inventory mapper uses is not available here — the type is all there is.
    for ( const type of ["weapon", "equipment", "consumable", "tool", "loot", "container"] ) {
      assert.equal(PHYSICAL_TYPES.has(type), true, type);
    }

    // Item packs hold these too, and none of them goes in a backpack.
    for ( const type of ["feat", "spell", "class", "subclass", "background", "race"] ) {
      assert.equal(PHYSICAL_TYPES.has(type), false, type);
    }
  });
});

/* -------------------------------------------- */

describe("searchItems", () => {
  it("matches anywhere in the name, not just the start", () => {
    // "mail" should find Chain Mail. Nobody thinks of an item by its first word.
    const { results } = searchItems([entry(), entry({ id: "a2", name: "Rope" })],
      { query: "mail", labels: LABELS });

    assert.deepEqual(results.map(r => r.name), ["Chain Mail"]);
  });

  it("ignores case and accents, which a phone keyboard makes hard to type", () => {
    const { results } = searchItems([entry({ name: "Piñata" })], { query: "pinata", labels: LABELS });
    assert.equal(results.length, 1);
  });

  it("returns everything when nothing is typed", () => {
    const { total } = searchItems([entry(), entry({ id: "a2", name: "Rope" })], { labels: LABELS });
    assert.equal(total, 2);
  });

  it("drops the same item published under two rules versions", () => {
    /*
     * dnd5e ships a 2014 `items` pack and a 2024 `equipment24` pack, and the
     * same chain mail carries a different identifier in each. Deduplicating by
     * identifier alone leaves both, and a search for "chain mail" in this world
     * returns four rows a player has no way to choose between.
     */
    const { results } = searchItems([
      entry({ id: "old", pack: "dnd5e.items" }),
      entry({ id: "new", pack: "dnd5e.equipment24" }),
      entry({ id: "phb", pack: "dnd-players-handbook.equipment" })
    ], { query: "chain", labels: LABELS });

    assert.equal(results.length, 1);

    // A module's copy wins: it carries the full text and artwork, and it is
    // where the character's existing gear came from.
    assert.equal(results[0].uuid, "Compendium.dnd-players-handbook.equipment.Item.phb");
  });

  it("does not collapse two genuinely different things", () => {
    const { results } = searchItems([
      entry({ id: "a1", name: "Longsword", type: "weapon" }),
      entry({ id: "a2", name: "Longbow", type: "weapon" })
    ], { labels: LABELS });

    assert.equal(results.length, 2);
  });

  it("says what kind of thing a row is, and whether it is magical", () => {
    const [row] = searchItems([entry({ name: "Flame Tongue", type: "weapon", rarity: "rare" })],
      { labels: LABELS }).results;

    assert.equal(row.meta, "Weapon · Rare");
    assert.equal(row.rarity, "rare");
  });

  it("leaves rarity off the row for ordinary gear, which is nearly all of it", () => {
    const [row] = searchItems([entry({ type: "weapon" })], { labels: LABELS }).results;
    assert.equal(row.meta, "Weapon");
    assert.equal(row.rarity, null);
  });

  it("never marks anything as already owned", () => {
    /*
     * The one place this departs from the spell browser. A character has one
     * copy of Cure Wounds or none; a character can perfectly well carry a
     * second rope, a third torch and seven more rations, so greying out what is
     * already in the pack would refuse the most ordinary use of this screen.
     */
    assert.equal(searchItems([entry()], { labels: LABELS }).results[0].owned, false);
  });

  it("orders by kind then name, matching the inventory screen", () => {
    const { results } = searchItems([
      entry({ id: "a1", name: "Torch", type: "consumable" }),
      entry({ id: "a2", name: "Sack", type: "container" }),
      entry({ id: "a3", name: "Axe", type: "weapon" }),
      entry({ id: "a4", name: "Anvil", type: "loot" }),
      entry({ id: "a5", name: "Buckler", type: "equipment" })
    ], { sort: ITEM_SORTS.TYPE, labels: LABELS });

    assert.deepEqual(results.map(r => r.name), ["Axe", "Buckler", "Torch", "Anvil", "Sack"]);
  });

  it("orders by name by default", () => {
    const { results } = searchItems([
      entry({ id: "a1", name: "Torch", type: "consumable" }),
      entry({ id: "a2", name: "Axe", type: "weapon" })
    ], { labels: LABELS });

    assert.deepEqual(results.map(r => r.name), ["Axe", "Torch"]);
  });

  it("caps the results and says how many were left out", () => {
    // Every row is a DOM node with an image, and the gear packs hold over two
    // thousand entries. Building all of them between keystrokes is the thing
    // the cap exists to prevent.
    const many = Array.from({ length: 20 },
      (_, i) => entry({ id: `a${i}`, name: `Rope ${String(i).padStart(2, "0")}` }));

    const { results, total, truncated } = searchItems(many, { limit: 5, labels: LABELS });

    assert.equal(results.length, 5);
    assert.equal(total, 20);
    assert.equal(truncated, true);
  });

  it("survives having no entries and no labels", () => {
    assert.deepEqual(searchItems([]), { results: [], total: 0, truncated: false });

    // Falls back to the raw type key rather than showing nothing.
    assert.equal(searchItems([entry({ type: "weapon" })]).results[0].meta, "weapon");
  });
});

/* -------------------------------------------- */

describe("shared browser primitives", () => {
  it("folds case and accents for comparison", () => {
    assert.equal(fold("Piñata"), "pinata");
    assert.equal(fold(undefined), "");
  });

  it("prefers a module's copy when deduplicating by identifier", () => {
    const kept = dedupeEntries([
      entry({ id: "x", pack: "dnd5e.items" }),
      entry({ id: "x", pack: "dnd-players-handbook.equipment" })
    ]);

    assert.equal(kept.length, 1);
    assert.equal(kept[0].pack, "dnd-players-handbook.equipment");
  });

  it("keeps the module copy whichever order they arrive in", () => {
    const kept = dedupeEntries([
      entry({ id: "x", pack: "dnd-players-handbook.equipment" }),
      entry({ id: "x", pack: "dnd5e.items" })
    ]);

    assert.equal(kept[0].pack, "dnd-players-handbook.equipment");
  });

  it("deduplicates by name regardless of case", () => {
    const kept = dedupeByName([
      entry({ id: "a", name: "Chain Mail" }),
      entry({ id: "b", name: "chain mail" })
    ]);

    assert.equal(kept.length, 1);
  });
});
