/**
 * Tests for the inventory mapper.
 *
 * Run with `npm run test:unit`. Plain objects shaped like dnd5e's items, taken
 * from the real ones read out of the development world — the test cleric really
 * does carry a Priest's Pack with six things in it, really does own two lamps
 * with one of them inside that pack, and really is a pound over their carrying
 * capacity. Each of those is a case a naive implementation gets wrong.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  buildCurrency, buildEncumbrance, buildInventoryView, buildItemGroups,
  describeItem, isEquippable, isPhysical, CARRIED
} from "../../scripts/data/inventory.mjs";

/** Item type names, as core supplies them in `CONFIG.Item.typeLabels`. */
const TYPE_LABELS = { weapon: "TYPES.Item.weapon", loot: "TYPES.Item.loot" };

/**
 * A stand-in for CONFIG.DND5E, carrying only what the mapper reads.
 *
 * `currencies` is in dnd5e's own order, richest first, which is the order the
 * purse is listed in. dnd5e pre-localises both labels, so what arrives here is
 * a display string rather than a key.
 */
const CONFIG_DND5E = {
  currencies: {
    pp: { label: "Platinum", abbreviation: "pp" },
    gp: { label: "Gold", abbreviation: "gp" },
    ep: { label: "Electrum", abbreviation: "ep" },
    sp: { label: "Silver", abbreviation: "sp" },
    cp: { label: "Copper", abbreviation: "cp" }
  },
  weightUnits: {
    lb: { label: "Pounds", abbreviation: "lb" }
  }
};

/**
 * An item, shaped like dnd5e's.
 *
 * `equipped` is omitted rather than set to false when `equippable` is false,
 * because that is the actual difference in dnd5e's schema: loot does not mix in
 * `EquippableItemTemplate`, so the field is absent rather than off. Conflating
 * the two is exactly the bug the capability check exists to avoid.
 *
 * @param {object} [overrides]
 * @returns {object}
 */
function item({
  id = "item1", name = "Mace", type = "weapon", equippable = true, equipped = false,
  quantity = 1, weight = 4, container = null, attunement = "", attuned = false,
  rarity = ""
} = {}) {
  return {
    id,
    name,
    type,
    img: "icons/svg/item-bag.svg",
    system: {
      quantity,
      weight: { value: weight, units: "lb" },
      rarity,
      container,
      ...(equippable ? { equipped, attunement, attuned } : {})
    }
  };
}

/**
 * The cleric's belongings, in the shape and order they arrive in.
 *
 * Deliberately unsorted and deliberately awkward: the pack is not first, the
 * two lamps are in different places, and one of the rows is loot with no
 * equipped field at all.
 */
function belongings() {
  return [
    item({ id: "lamp1", name: "Lamp", type: "equipment", weight: 1 }),
    item({ id: "pistol", name: "Pistol", equipped: true, weight: 3 }),
    item({ id: "parchment", name: "Parchment", type: "loot", equippable: false, quantity: 12, weight: 0 }),
    item({ id: "pack", name: "Priest's Pack", type: "container", weight: 5 }),
    item({ id: "blanket", name: "Blanket", type: "loot", equippable: false, weight: 3, container: "pack" }),
    item({ id: "rations", name: "Rations", type: "consumable", quantity: 7, weight: 2, container: "pack" }),
    item({ id: "lamp2", name: "Lamp", type: "equipment", weight: 1, container: "pack" }),
    item({ id: "mace", name: "Mace", weight: 4 }),

    // Not physical: a class feature has no quantity, and dnd5e's spells and
    // feats arrive in the same collection as everything else.
    { id: "channel", name: "Channel Divinity", type: "feat", system: { activities: { contents: [] } } }
  ];
}

/* -------------------------------------------- */

describe("isPhysical", () => {
  it("recognises a carried thing by its quantity rather than by a list of types", () => {
    assert.equal(isPhysical(item()), true);
    assert.equal(isPhysical(item({ type: "loot", equippable: false })), true);

    // A future physical item type should appear without this file hearing
    // about it, which a hard-coded list of names would not manage.
    assert.equal(isPhysical(item({ type: "gadget" })), true);
  });

  it("excludes anything with no quantity", () => {
    assert.equal(isPhysical({ id: "f", type: "feat", system: {} }), false);
    assert.equal(isPhysical({ id: "s", type: "spell" }), false);
    assert.equal(isPhysical(undefined), false);
  });
});

/* -------------------------------------------- */

describe("isEquippable", () => {
  it("asks the schema rather than assuming", () => {
    // Weapons, equipment, tools, consumables and containers all mix in dnd5e's
    // EquippableItemTemplate; loot does not, so the field is absent rather
    // than false. Reading a missing field as "not equipped" would give a rope
    // a toggle that writes a field nothing reads.
    assert.equal(isEquippable(item()), true);
    assert.equal(isEquippable(item({ equipped: false })), true);
    assert.equal(isEquippable(item({ type: "loot", equippable: false })), false);
  });
});

/* -------------------------------------------- */

describe("describeItem", () => {
  it("reports the weight of the whole stack", () => {
    // Seven rations at two pounds each is fourteen pounds of the answer to
    // "what do I put down". Per-item weight is not.
    const row = describeItem(item({ name: "Rations", quantity: 7, weight: 2 }), CONFIG_DND5E);
    assert.deepEqual(row.weight, { value: 14, units: "lb" });
    assert.equal(row.quantity, 7);
  });

  it("rounds a weight that does not divide cleanly", () => {
    const row = describeItem(item({ quantity: 7, weight: 0.25 }), CONFIG_DND5E);
    assert.equal(row.weight.value, 1.8);
  });

  it("omits a weight of zero rather than printing it", () => {
    assert.equal(describeItem(item({ weight: 0 }), CONFIG_DND5E).weight, null);
  });

  it("separates being equipped from being attuned", () => {
    // A shield is equipped and not attuned; a magic amulet may be attuned
    // while stowed at the bottom of a pack. One does not imply the other.
    const amulet = describeItem(
      item({ type: "equipment", attunement: "required", attuned: true, equipped: false }),
      CONFIG_DND5E
    );

    assert.equal(amulet.equipped, false);
    assert.equal(amulet.attuned, true);
    assert.equal(amulet.attunable, true);
    assert.equal(amulet.attunementRequired, true);
  });

  it("offers no attunement control on something that has nothing to say about it", () => {
    const rope = describeItem(item({ type: "equipment" }), CONFIG_DND5E);
    assert.equal(rope.attunable, false);
  });

  it("carries the item type as both a key and a word", () => {
    const row = describeItem(item(), CONFIG_DND5E, TYPE_LABELS);
    assert.equal(row.itemType, "weapon");
    assert.equal(row.typeLabel, "TYPES.Item.weapon");
  });
});

/* -------------------------------------------- */

describe("buildItemGroups", () => {
  it("groups by where a thing is, not by what kind of thing it is", () => {
    const groups = buildItemGroups(belongings(), CONFIG_DND5E, TYPE_LABELS);

    assert.deepEqual(groups.map(g => g.key), [CARRIED, "pack"]);

    // Two lamps, one in hand and one at the bottom of the pack. Sorted by type
    // they are an unexplained duplicate; sorted by container they are two
    // obvious facts.
    const carried = groups[0].entries.map(e => e.name);
    const packed = groups[1].entries.map(e => e.name);
    assert.ok(carried.includes("Lamp"));
    assert.ok(packed.includes("Lamp"));
  });

  it("orders rows by kind and then by name, as the actions screen does", () => {
    const [carried] = buildItemGroups(belongings(), CONFIG_DND5E, TYPE_LABELS);

    // Weapons, then equipment, then loot — with alphabetical order inside each
    // kind, so muscle memory survives picking up a new item.
    assert.deepEqual(carried.entries.map(e => e.name), ["Mace", "Pistol", "Lamp", "Parchment"]);
  });

  it("gives a container one appearance, as the heading of its own group", () => {
    const groups = buildItemGroups(belongings(), CONFIG_DND5E, TYPE_LABELS);

    // Named twice, the player has to work out which one is the pack and which
    // one is the pack's label.
    assert.equal(groups[0].entries.filter(e => e.name === "Priest's Pack").length, 0);
    assert.equal(groups[1].label, "Priest's Pack");
    assert.equal(groups[1].container.id, "pack");

    // The heading carries the controls the missing row would have.
    assert.equal(groups[1].container.equippable, true);
  });

  it("weighs a container together with everything in it", () => {
    const groups = buildItemGroups(belongings(), CONFIG_DND5E, TYPE_LABELS);

    // The pack itself is 5, the blanket 3, seven rations 14, the lamp 1.
    assert.deepEqual(groups[1].container.weight, { value: 23, units: "lb" });
  });

  it("leaves out anything that is not carried", () => {
    const names = buildItemGroups(belongings(), CONFIG_DND5E, TYPE_LABELS)
      .flatMap(g => g.entries.map(e => e.name));

    assert.ok(!names.includes("Channel Divinity"));
  });

  it("keeps the carried group when everything is packed away", () => {
    // An inventory whose first heading is a container reads as though the
    // character owns nothing of their own.
    const groups = buildItemGroups([
      item({ id: "pack", name: "Priest's Pack", type: "container", weight: 5 }),
      item({ id: "lamp2", name: "Lamp", type: "equipment", container: "pack" })
    ], CONFIG_DND5E, TYPE_LABELS);

    assert.equal(groups[0].key, CARRIED);
    assert.deepEqual(groups[0].entries, []);
  });

  it("orders containers stably", () => {
    // Arbitrary but fixed: a pack that moved between renders would put a row
    // under a finger that was aimed at a different one.
    const groups = buildItemGroups([
      item({ id: "sack", name: "Sack", type: "container" }),
      item({ id: "pack", name: "Backpack", type: "container" })
    ], CONFIG_DND5E, TYPE_LABELS);

    assert.deepEqual(groups.map(g => g.label), ["PHONEDRY.Items.Carried", "Backpack", "Sack"]);
  });

  it("returns nothing at all for a character carrying nothing", () => {
    assert.deepEqual(buildItemGroups([], CONFIG_DND5E, TYPE_LABELS), []);
  });
});

/* -------------------------------------------- */

describe("buildCurrency", () => {
  it("lists only what is actually held", () => {
    // A row of five zeroes is noise on a screen with none to spare.
    const purse = buildCurrency({ pp: 0, gp: 12, ep: 0, sp: 4, cp: 0 }, CONFIG_DND5E);
    assert.deepEqual(purse, [
      { key: "gp", value: 12, label: "gp" },
      { key: "sp", value: 4, label: "sp" }
    ]);
  });

  it("keeps dnd5e's order rather than sorting by amount", () => {
    const purse = buildCurrency({ cp: 99, pp: 1 }, CONFIG_DND5E);
    assert.deepEqual(purse.map(c => c.key), ["pp", "cp"]);
  });

  it("says nothing when the purse is empty", () => {
    assert.deepEqual(buildCurrency({}, CONFIG_DND5E), []);
    assert.deepEqual(buildCurrency(undefined, CONFIG_DND5E), []);
  });
});

/* -------------------------------------------- */

describe("buildEncumbrance", () => {
  const thresholds = { encumbered: 40, heavilyEncumbered: 80, maximum: 120 };

  it("reports the load as a proportion of capacity", () => {
    const load = buildEncumbrance({ value: 60, max: 120, units: "lb", thresholds }, CONFIG_DND5E);
    assert.deepEqual(load, { value: 60, max: 120, pct: 50, over: false, units: "lb" });
  });

  it("marks exceeding carrying capacity and nothing below it", () => {
    // The cleric's real state: a pound over. Encumbered and heavily encumbered
    // are an optional variant rule, so passing those thresholds is deliberately
    // not reported — a sheet that coloured for a rule the table may not play
    // would be telling the player something untrue.
    const heavy = buildEncumbrance({ value: 100, max: 120, units: "lb", thresholds }, CONFIG_DND5E);
    assert.equal(heavy.over, false);

    const over = buildEncumbrance({ value: 121, max: 120, units: "lb", thresholds }, CONFIG_DND5E);
    assert.equal(over.over, true);
  });

  it("clamps the bar without clamping the number", () => {
    // Past capacity the bar has nothing further to say; the number beside it is
    // what carries the overage.
    const over = buildEncumbrance({ value: 200, max: 120, units: "lb", thresholds }, CONFIG_DND5E);
    assert.equal(over.pct, 100);
    assert.equal(over.value, 200);
  });

  it("says nothing when there is no capacity to measure against", () => {
    assert.equal(buildEncumbrance(undefined, CONFIG_DND5E), null);
    assert.equal(buildEncumbrance({ value: 10, max: 0 }, CONFIG_DND5E), null);
    assert.equal(buildEncumbrance({ value: 10, max: Infinity }, CONFIG_DND5E), null);
  });
});

/* -------------------------------------------- */

describe("buildInventoryView", () => {
  /**
   * An actor-shaped object.
   *
   * @param {object} [overrides]
   * @returns {object}
   */
  function actor({ items = belongings(), currency = { gp: 12 }, attunement = { value: 0, max: 3 } } = {}) {
    return {
      items,
      system: {
        currency,
        attributes: {
          attunement,
          encumbrance: {
            value: 121, max: 120, units: "lb",
            thresholds: { encumbered: 40, heavilyEncumbered: 80, maximum: 120 }
          }
        }
      }
    };
  }

  it("assembles the whole screen", () => {
    const view = buildInventoryView(actor(), CONFIG_DND5E, TYPE_LABELS);

    assert.equal(view.empty, false);
    assert.equal(view.groups.length, 2);
    assert.deepEqual(view.currency, [{ key: "gp", value: 12, label: "gp" }]);
    assert.equal(view.encumbrance.over, true);
    assert.deepEqual(view.attunement, { value: 0, max: 3, over: false });
  });

  it("counts attunements past the limit rather than hiding them", () => {
    // dnd5e counts them and leaves the ruling to the table; a sheet that
    // refused the tap would be enforcing a rule the system does not.
    const view = buildInventoryView(actor({ attunement: { value: 4, max: 3 } }), CONFIG_DND5E, TYPE_LABELS);
    assert.equal(view.attunement.over, true);
  });

  it("omits attunement entirely where there is no limit set", () => {
    const view = buildInventoryView(actor({ attunement: {} }), CONFIG_DND5E, TYPE_LABELS);
    assert.equal(view.attunement, null);
  });

  it("lands on the empty state for a character carrying nothing", () => {
    const view = buildInventoryView(actor({ items: [] }), CONFIG_DND5E, TYPE_LABELS);
    assert.equal(view.empty, true);
    assert.deepEqual(view.groups, []);
  });

  it("survives an actor with nothing on it at all", () => {
    // The template branches on the view model rather than on the actor, so a
    // mapper that threw here would be a blank screen rather than an error.
    const view = buildInventoryView({}, CONFIG_DND5E, TYPE_LABELS);
    assert.equal(view.empty, true);
    assert.equal(view.encumbrance, null);
    assert.equal(view.attunement, null);
  });
});
