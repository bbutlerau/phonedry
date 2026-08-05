/**
 * Finding who is available to target, without a map.
 *
 * Everything here reads documents rather than canvas objects, which is what
 * makes it work at all on a canvas-free client. A Combatant knows its name, its
 * image, its disposition and its actor; the actor knows its armour class. That
 * is the whole of what the tokens on a map were showing.
 */

/**
 * Describe one combatant or party member as a target row.
 *
 * @param {object} options
 * @param {Actor} options.actor
 * @param {string} [options.name]   The token's name, which may differ from the actor's.
 * @param {string} [options.img]
 * @param {number} [options.disposition]
 * @param {string} [options.tokenId]
 * @param {boolean} [options.defeated]
 * @returns {object|null}
 */
function describeCandidate({ actor, name, img, disposition, tokenId, defeated = false }) {
  if ( !actor ) return null;

  return {
    // The actor uuid identifies the target to dnd5e; the token id is what other
    // clients need to highlight it on their map. Both are carried because they
    // answer different questions and neither substitutes for the other.
    id: actor.uuid,
    tokenId: tokenId ?? null,

    name: name || actor.name,
    img: img || actor.img,

    ac: actor.system?.attributes?.ac?.value ?? null,
    disposition: disposition ?? 0,
    defeated
  };
}

/* -------------------------------------------- */

/**
 * Who the character could be aiming at.
 *
 * The active encounter first, because if there is a fight on then everyone who
 * matters is in it and the combat tracker is the one list that already knows
 * which side they are on. Falling back to the party covers casting between
 * fights, which is most healing.
 *
 * @returns {object[]}
 */
export function collectCandidates(self) {
  const combat = game.combats?.active;

  if ( combat?.combatants?.size ) {
    return combat.combatants.contents
      .filter(combatant => !combatant.hidden)
      .map(combatant => describeCandidate({
        actor: combatant.actor,
        name: combatant.name,
        img: combatant.img,

        // The disposition lives on the token, not the combatant, and a
        // combatant without one is possible — it sorts as neutral rather than
        // guessing at a side.
        disposition: combatant.token?.disposition,
        tokenId: combatant.tokenId,
        defeated: combatant.isDefeated
      }))
      .filter(Boolean);
  }

  return collectParty(self);
}

/**
 * The party, for casting outside a fight.
 *
 * Three answers, in descending order of how much the world has told us:
 *
 * 1. The primary party, if the world nominates one. That is dnd5e's own answer
 *    to "who is the party", so it wins wherever it is set.
 * 2. A group actor containing this character. Worlds often have a party group
 *    without ever marking it primary, and the group *this* character is in is a
 *    better guess than any other group in the world — a campaign with two
 *    tables has two groups, and only one of them is yours.
 * 3. Every player-owned character. A blunt fallback, but still far shorter than
 *    every actor in the world and right in the common case of one party.
 *
 * @param {Actor|null} [self]  The character casting, used to find their group.
 * @returns {object[]}
 */
function collectParty(self) {
  const members = partyMembers(self);

  return members
    .map(actor => describeCandidate({
      actor,

      // Everyone in the party is on the same side by definition, so they group
      // as allies without a token to read a disposition from.
      disposition: 1
    }))
    .filter(Boolean);
}

/**
 * The actors making up the party, by whichever route the world supports.
 *
 * @param {Actor|null} [self]
 * @returns {Actor[]}
 */
function partyMembers(self) {
  const primary = game.settings.get("dnd5e", "primaryParty")?.actor;
  const fromPrimary = groupMembers(primary);
  if ( fromPrimary.length ) return fromPrimary;

  // A group holding this character. `find` rather than a merge of every group:
  // a world with two tables has two parties, and the other one is not ours.
  if ( self ) {
    const group = game.actors.find(actor => (actor.type === "group")
      && groupMembers(actor).some(member => member.id === self.id));

    const fromGroup = groupMembers(group);
    if ( fromGroup.length ) return fromGroup;
  }

  return game.actors.filter(actor => (actor.type === "character") && actor.hasPlayerOwner);
}

/**
 * The actors inside a group actor.
 *
 * dnd5e has moved this between shapes — entries have been raw actors and have
 * been wrappers carrying one — so both are accepted rather than assuming
 * whichever this version happens to use.
 *
 * @param {Actor|null} group
 * @returns {Actor[]}
 */
function groupMembers(group) {
  const members = group?.system?.members ?? [];
  return members.map(member => member?.actor ?? member).filter(member => member?.id);
}

/* -------------------------------------------- */

/**
 * Turn chosen ids into the descriptors dnd5e puts on a chat card.
 *
 * The shape is dnd5e's — `{ name, img, uuid, ac }` — because these go straight
 * into the message flags it would otherwise build from the canvas. Matching it
 * is what makes the card show targets and their armour classes exactly as it
 * does on a desktop.
 *
 * @param {object[]} candidates
 * @param {Set<string>} selected
 * @returns {object[]}
 */
export function targetDescriptors(candidates, selected) {
  return candidates
    .filter(candidate => selected.has(candidate.id))
    .map(({ name, img, id, ac }) => ({ name, img, uuid: id, ac }));
}

/**
 * Tell everyone else what is being aimed at.
 *
 * Best-effort, and deliberately not depended on. Other clients answer this by
 * highlighting the tokens on their own map, which is how a GM sees who a player
 * has picked — but a client without a canvas cannot be told about it in return,
 * and Foundry drops the message if the sender is not looking at the same scene.
 * The chat card is what carries the targets reliably; this is what makes them
 * visible on the table.
 *
 * @param {object[]} candidates
 * @param {Set<string>} selected
 */
export function broadcastTargets(candidates, selected) {
  const tokenIds = candidates
    .filter(candidate => selected.has(candidate.id) && candidate.tokenId)
    .map(candidate => candidate.tokenId);

  try {
    game.user.broadcastActivity({ targets: tokenIds });
  } catch ( error ) {
    console.warn("phonedry | could not broadcast targets", error);
  }
}
