/**
 * The actor → view model mapper for the spells screen.
 *
 * Pure and synchronous, like the stats mapper, and for the same reason: this is
 * the layer that breaks when dnd5e changes its data model, and it can only be
 * cheaply tested if it depends on nothing.
 *
 * dnd5e computes display strings itself — `item.labels.school`, `.activation`,
 * `.range`, `.components` — so this reads them rather than deriving them. That
 * is the same rule as everywhere else in this module: the system owns what a
 * spell means, we own where it sits on screen.
 */

/**
 * `system.prepared` values in dnd5e 5.x. It is a number, not a flag:
 * 0 unprepared, 1 prepared, 2 always prepared.
 *
 * Worth stating because the field was an object in earlier majors —
 * `{ mode, prepared }` — and the old shape reads as `undefined` rather than
 * throwing, so getting this wrong shows every spell as unprepared and looks
 * like a styling bug.
 */
export const PREPARED = { NO: 0, YES: 1, ALWAYS: 2 };

/**
 * Preparation methods that do not consume a spell slot.
 *
 * An at-will casting and a racial innate casting are each cast by their own
 * rules, and neither is prepared or unprepared in the sense the toggle means.
 */
const SLOTLESS_METHODS = new Set(["atwill", "innate"]);

/**
 * Should this spell show a prepare toggle?
 *
 * `system.canPrepare` is used only as a veto, never as the answer. It reads
 * like the question being asked here and is not: dnd5e reports it true for
 * every spell on a cleric including cantrips, so trusting it put a preparation
 * checkbox beside Guidance. It appears to mean "this item has a meaningful
 * preparation field", not "this character prepares this spell". Honoured when
 * it says no — that covers a class which knows spells rather than preparing
 * them — and ignored when it says yes.
 *
 * Always-prepared spells are excluded too: a domain spell or a racial grant is
 * prepared by something the player cannot change from this sheet, so a control
 * beside it would be a lie.
 *
 * @param {object} spell  A spell item.
 * @returns {boolean}
 */
export function canPrepare(spell) {
  const system = spell.system ?? {};

  if ( system.canPrepare === false ) return false;
  if ( system.prepared === PREPARED.ALWAYS ) return false;

  // Cantrips are always available and cost nothing to cast.
  if ( (system.level ?? 0) === 0 ) return false;

  return !SLOTLESS_METHODS.has(system.method);
}

/**
 * Is this spell currently castable without further preparation?
 *
 * Anything with no preparation to do — a cantrip, an innate casting, an
 * always-prepared domain spell — counts as prepared, because from the player's
 * side it is simply available.
 *
 * @param {object} spell
 * @returns {boolean}
 */
export function isPrepared(spell) {
  if ( !canPrepare(spell) ) return true;
  return (spell.system?.prepared ?? PREPARED.NO) > PREPARED.NO;
}

/* -------------------------------------------- */

/**
 * Describe one spell for display.
 *
 * @param {object} spell  A spell item.
 * @returns {object}
 */
export function describeSpell(spell) {
  const system = spell.system ?? {};
  const labels = spell.labels ?? {};
  const uses = system.uses ?? {};

  return {
    id: spell.id,
    name: spell.name,
    img: spell.img,
    level: system.level ?? 0,
    school: labels.school ?? null,
    activation: labels.activation ?? null,
    range: labels.range ?? null,

    prepared: isPrepared(spell),
    preparable: canPrepare(spell),
    method: system.method ?? "spell",

    // A limited-use spell — a racial casting with "1/Day" — tracks its own
    // charges rather than drawing on slots, so the sheet shows those instead.
    uses: (uses.max > 0) ? { value: uses.value ?? 0, max: uses.max, label: uses.label ?? null } : null,

    // Concentration and ritual change how a spell is used often enough to be
    // worth a badge, and dnd5e already records both as properties.
    concentration: !!system.properties?.has?.("concentration"),
    ritual: !!system.properties?.has?.("ritual")
  };
}

/* -------------------------------------------- */

/**
 * Build the spell slot rows.
 *
 * Levels with no slots at all are dropped: a level 7 cleric has nothing above
 * fourth, and nine rows of "0/0" would push the spells themselves off screen.
 * Pact magic is included when present, because a warlock's slots are the only
 * ones they have.
 *
 * @param {object} system  The actor's `system` data.
 * @param {object} config  `CONFIG.DND5E`.
 * @returns {object[]}
 */
export function buildSlots(system, config) {
  const spells = system.spells ?? {};

  return Object.entries(spells)
    .map(([key, slot]) => {
      const level = slot.level ?? Number.parseInt(key.replace("spell", ""), 10);
      return {
        key,
        level: Number.isFinite(level) ? level : null,
        label: (key === "pact")
          ? (config.spellPreparationModes?.pact?.label ?? "Pact")
          : String(level),
        value: slot.value ?? 0,
        max: slot.max ?? 0,
        pact: key === "pact"
      };
    })
    .filter(slot => slot.max > 0);
}

/* -------------------------------------------- */

/**
 * Group spells by level, in casting order.
 *
 * Level order rather than alphabetical, which is the opposite of the skills
 * list and deliberately so: a spell is chosen by what it costs first and what
 * it does second, and cantrips being free is the single most consulted fact on
 * this screen.
 *
 * @param {object[]} spells  The actor's spell items.
 * @param {object} system    The actor's `system` data.
 * @param {object} config    `CONFIG.DND5E`.
 * @returns {object[]}
 */
export function buildSpellGroups(spells, system, config) {
  const slots = new Map(buildSlots(system, config).map(slot => [slot.level, slot]));
  const groups = new Map();

  for ( const spell of spells ) {
    const described = describeSpell(spell);
    if ( !groups.has(described.level) ) groups.set(described.level, []);
    groups.get(described.level).push(described);
  }

  return [...groups.entries()]
    .sort(([a], [b]) => a - b)
    .map(([level, entries]) => ({
      level,
      label: level === 0
        ? (config.spellLevels?.[0] ?? "Cantrip")
        : (config.spellLevels?.[level] ?? `Level ${level}`),

      // Cantrips cost nothing, so a slot counter beside them would be noise.
      slots: (level === 0) ? null : (slots.get(level) ?? null),

      prepared: entries.filter(e => e.preparable && e.prepared).length,
      preparable: entries.some(e => e.preparable),

      spells: entries.sort((a, b) => a.name.localeCompare(b.name))
    }));
}

/* -------------------------------------------- */

/**
 * Build the whole spells view model.
 *
 * @param {object} actor   An actor-shaped object.
 * @param {object} config  `CONFIG.DND5E`.
 * @returns {object}
 */
export function buildSpellsView(actor, config) {
  const system = actor.system ?? {};
  const spells = (actor.items ?? []).filter(item => item.type === "spell");

  return {
    slots: buildSlots(system, config),
    groups: buildSpellGroups(spells, system, config),
    empty: spells.length === 0,

    dc: system.attributes?.spell?.dc ?? null,
    attack: system.attributes?.spell?.attack ?? null
  };
}
