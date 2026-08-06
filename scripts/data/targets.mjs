/**
 * Choosing who a spell is aimed at.
 *
 * Pure and synchronous like the other mappers.
 *
 * The reason this screen exists at all is the canvas. Everywhere else in
 * Foundry you target by clicking tokens on the map, and this module never
 * builds a map — so a phone player has had no way to say who they were casting
 * at. What they *can* still reach are the documents behind the map: the combat
 * encounter and its combatants, each carrying a name, an image, a disposition
 * and an armour class. That is enough to pick from, and it is the same
 * information the tokens were displaying.
 */

/**
 * Target types that mean "pick some creatures".
 *
 * The rest of dnd5e's list is not something a player chooses from a list:
 * `self` has exactly one answer, and `space` and `object` are places and things
 * on a map this client does not draw.
 */
const PICKABLE = new Set(["ally", "enemy", "creature", "creatureOrObject", "any", "willing"]);

/**
 * Token dispositions, as core numbers them. Local rather than imported so this
 * module stays free of Foundry globals and therefore testable.
 */
const DISPOSITION = { HOSTILE: -1, NEUTRAL: 0, FRIENDLY: 1 };

/* -------------------------------------------- */

/**
 * Does this activity want targets a player can pick from a list?
 *
 * A template spell — a fireball, a burning hands cone — is deliberately
 * excluded. Those are aimed at a patch of ground rather than at creatures, and
 * working out who is caught in the area needs the map this client does not
 * draw. Offering a target list for one would invite a player to pick three
 * names and believe the area had been resolved.
 *
 * An attack roll — a weapon swing as much as a spell like Fire Bolt — wants
 * targets too, and is checked for on its own rather than folded into
 * `PICKABLE`. dnd5e's spells set `target.affects.type` to something like
 * `creatureOrObject`, which is what `PICKABLE` was written against, but a
 * weapon's own Attack activity leaves that field empty — the rules do not
 * need it stated, because making an attack roll already implies a target.
 * Reading `activity.type` instead is what makes a weapon behave the same as
 * a spell here rather than silently doing nothing.
 *
 * @param {object} activity  An activity, as dnd5e prepares it.
 * @returns {boolean}
 */
export function needsTargets(activity) {
  const target = activity?.target ?? {};
  if ( target.template?.type ) return false;
  if ( activity?.type === "attack" ) return true;
  return PICKABLE.has(target.affects?.type);
}

/**
 * How many targets the activity allows, or null for no stated limit.
 *
 * @param {object} activity
 * @returns {number|null}
 */
export function targetLimit(activity) {
  const count = activity?.target?.affects?.count;
  return Number.isFinite(count) && (count > 0) ? count : null;
}

/* -------------------------------------------- */

/**
 * Group candidates the way a player thinks about them.
 *
 * Enemies first. In a fight the overwhelmingly common case is aiming something
 * at the thing trying to kill you, and the list is read under time pressure —
 * so the group reached for most often goes where the thumb already is rather
 * than below a list of allies.
 *
 * @param {object[]} candidates  Flattened combatants or party members.
 * @returns {object[]}
 */
export function groupCandidates(candidates = []) {
  const groups = [
    { id: "enemies", label: "PHONEDRY.Targets.Enemies", entries: [] },
    { id: "allies", label: "PHONEDRY.Targets.Allies", entries: [] },
    { id: "other", label: "PHONEDRY.Targets.Other", entries: [] }
  ];

  const byId = Object.fromEntries(groups.map(g => [g.id, g]));

  for ( const candidate of candidates ) {
    if ( candidate.disposition === DISPOSITION.HOSTILE ) byId.enemies.entries.push(candidate);
    else if ( candidate.disposition === DISPOSITION.FRIENDLY ) byId.allies.entries.push(candidate);
    else byId.other.entries.push(candidate);
  }

  for ( const group of groups ) {
    // Defeated combatants sink rather than disappear. A downed enemy is still a
    // legal target for plenty of things, and removing the row would shift every
    // other one under a finger that is already moving.
    group.entries.sort((a, b) => (a.defeated - b.defeated) || a.name.localeCompare(b.name));
  }

  return groups.filter(group => group.entries.length);
}

/* -------------------------------------------- */

/**
 * Build the target picker's view model.
 *
 * @param {object} options
 * @param {object} [options.activity]      The activity being aimed.
 * @param {string} [options.name]          What is being cast.
 * @param {object[]} [options.candidates]  Who is available.
 * @param {Set<string>} [options.selected] Chosen ids.
 * @returns {object}
 */
export function buildTargetsView({ activity, name = "", candidates = [], selected = new Set() } = {}) {
  const limit = targetLimit(activity);

  const groups = groupCandidates(candidates).map(group => ({
    ...group,
    entries: group.entries.map(entry => ({ ...entry, selected: selected.has(entry.id) }))
  }));

  const count = selected.size;

  return {
    name,
    groups,
    limit,
    count,

    // Shown rather than enforced by disabling rows. A limit is a rule about
    // the spell, and dnd5e is what enforces rules — but a player who has picked
    // four creatures for a spell that allows three should be told before they
    // cast, not after.
    over: (limit !== null) && (count > limit),

    empty: groups.length === 0,
    none: count === 0
  };
}
