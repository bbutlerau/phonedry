/**
 * Tests for the compendium spell search.
 *
 * Run with `npm run test:unit`. The fixtures are compendium index entries,
 * which is what this layer works on — not documents.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { dedupeEntries, fold, MAX_RESULTS, searchSpells } from "../../scripts/data/spell-browser.mjs";

/**
 * A compendium index entry.
 *
 * @param {string} name
 * @param {object} [overrides]
 * @returns {object}
 */
function entry(name, { pack = "dnd-players-handbook.spells", id } = {}) {
  const _id = id ?? name.toLowerCase().replace(/\W/g, "");
  return { _id, name, img: "icons/svg/daze.svg", pack, uuid: `Compendium.${pack}.Item.${_id}` };
}

/* -------------------------------------------- */

describe("fold", () => {
  it("ignores case", () => {
    assert.equal(fold("Cure Wounds"), "cure wounds");
  });

  it("strips accents, which a phone keyboard makes awkward to type", () => {
    assert.equal(fold("Séance"), "seance");
  });

  it("tolerates nothing", () => {
    assert.equal(fold(undefined), "");
  });
});

/* -------------------------------------------- */

describe("dedupeEntries", () => {
  it("collapses the same spell from two compendiums", () => {
    // Every spell in a world with the Player's Handbook module installed
    // appears twice, sharing an id. Offering both is two identical rows with no
    // way to tell them apart.
    const entries = [
      entry("Aid", { pack: "dnd5e.spells24" }),
      entry("Aid", { pack: "dnd-players-handbook.spells" })
    ];

    const [only] = dedupeEntries(entries);
    assert.equal(dedupeEntries(entries).length, 1);

    // The premium module wins: it carries the full text, and it is where the
    // character's existing spells came from.
    assert.equal(only.pack, "dnd-players-handbook.spells");
  });

  it("keeps the core entry when there is no alternative", () => {
    const [only] = dedupeEntries([entry("Aid", { pack: "dnd5e.spells24" })]);
    assert.equal(only.pack, "dnd5e.spells24");
  });

  it("does not collapse different spells", () => {
    assert.equal(dedupeEntries([entry("Aid"), entry("Bless")]).length, 2);
  });
});

/* -------------------------------------------- */

describe("searchSpells", () => {
  const entries = [entry("Cure Wounds"), entry("Inflict Wounds"), entry("Bless"), entry("Aid")];

  it("sorts by name so the list is navigable", () => {
    const { results } = searchSpells(entries);
    assert.deepEqual(results.map(r => r.name), ["Aid", "Bless", "Cure Wounds", "Inflict Wounds"]);
  });

  it("matches anywhere in the name, not only the start", () => {
    // Someone thinking of a spell rarely starts from its first word.
    const { results } = searchSpells(entries, { query: "wounds" });
    assert.deepEqual(results.map(r => r.name), ["Cure Wounds", "Inflict Wounds"]);
  });

  it("ignores case and surrounding space", () => {
    const { results } = searchSpells(entries, { query: "  BLESS " });
    assert.deepEqual(results.map(r => r.name), ["Bless"]);
  });

  it("marks spells the character already has rather than hiding them", () => {
    // A player searching for a spell they already know wants to be told so,
    // not left wondering whether the search is broken.
    const owned = new Set([entry("Bless")._id]);
    const { results } = searchSpells(entries, { owned });

    assert.equal(results.find(r => r.name === "Bless").owned, true);
    assert.equal(results.find(r => r.name === "Aid").owned, false);
  });

  it("caps the results and says how many there were", () => {
    const many = Array.from({ length: MAX_RESULTS + 15 }, (_, i) => entry(`Spell ${i}`));
    const { results, total, truncated } = searchSpells(many);

    assert.equal(results.length, MAX_RESULTS);
    assert.equal(total, MAX_RESULTS + 15);
    assert.equal(truncated, true);
  });

  it("does not claim truncation when everything fits", () => {
    const { truncated, total } = searchSpells(entries);
    assert.equal(truncated, false);
    assert.equal(total, 4);
  });

  it("dedupes before counting, so the total is not inflated", () => {
    const duplicated = [
      entry("Aid", { pack: "dnd5e.spells24" }),
      entry("Aid", { pack: "dnd-players-handbook.spells" })
    ];
    assert.equal(searchSpells(duplicated).total, 1);
  });
});
