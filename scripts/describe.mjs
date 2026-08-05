/**
 * Reading what something is.
 *
 * The description is authored HTML with Foundry's own markup inside it —
 * `[[/damage 2d6]]`, `@UUID[...]{Fireball}`, `&Reference[condition]` — none of
 * which means anything until it is enriched. Enrichment is what turns those
 * into readable text, so it is not an optional nicety: skipped, a spell
 * description reads as a page of markup.
 *
 * Two kinds of thing end up in this panel, and they keep their text in
 * different places. An item — a spell, a weapon, a feature — has
 * `system.description.value`. A rules page from dnd5e's own reference
 * compendium, which is what a skill points at, is a JournalEntryPage with
 * `text.content`. Everything after that is the same, so the difference is
 * confined to one line.
 */

/**
 * Resolve whatever a held element points at.
 *
 * Rows on the sheet carry an item id. Rows in the spell browser carry a
 * compendium uuid, because the spell is not on the character yet — being able
 * to read a spell *before* adding it is most of the point of the gesture there.
 * Skills carry a uuid too, pointing at the rule rather than at anything the
 * character owns: a skill is not an item, so there is nothing else to read.
 *
 * @param {object} dataset       The held element's dataset.
 * @param {Actor|null} actor
 * @returns {Promise<Document|null>}
 */
export async function resolveDescribable({ describe, describeUuid }, actor) {
  if ( describeUuid ) return fromUuid(describeUuid);
  if ( describe ) return actor?.items.get(describe) ?? null;
  return null;
}

/**
 * The authored HTML behind a document, wherever it keeps it.
 *
 * @param {Document} doc
 * @returns {string}
 */
function sourceHtml(doc) {
  return doc.system?.description?.value ?? doc.text?.content ?? "";
}

/**
 * The facts worth putting above a description, in the order they are asked for.
 *
 * dnd5e composes every one of these as a display string already —
 * `labels.activation` is "Action", `labels.range` is "120 ft" — so this is a
 * selection and an ordering, not a calculation. That matters: casting time and
 * range are derived from several fields apiece and vary by rules version, and
 * deriving them ourselves would be reimplementing the system to arrive at a
 * string it has already written.
 *
 * The order is the order a caster reads them at the table: what it costs to
 * cast, how far it reaches, what it touches, how long it lasts.
 */
const FACTS = [
  { key: "activation", label: "PHONEDRY.Describe.CastingTime" },
  { key: "range", label: "PHONEDRY.Describe.Range" },
  { key: "target", label: "PHONEDRY.Describe.Target" },
  { key: "duration", label: "PHONEDRY.Describe.Duration" }
];

/**
 * Build the fact list shown above a description.
 *
 * Applies to more than spells: a feature and a weapon carry the same labels, so
 * holding either gives the same answers about what it costs and how far it
 * reaches.
 *
 * @param {object} labels  An item's `labels`, as dnd5e composes them.
 * @returns {Array<{label: string, value: string}>}
 */
export function buildFacts(labels = {}) {
  const facts = FACTS
    .filter(({ key }) => labels[key])
    .map(({ key, label }) => ({ label, value: labels[key] }));

  // Components are a spell's alone, and the material list belongs with them
  // rather than as a fact of its own — "V, S, M (a holy symbol)" is how the
  // rules write it and how a player expects to read it.
  const components = labels.components?.vsm;
  if ( components ) {
    facts.push({
      label: "PHONEDRY.Describe.Components",
      value: labels.materials ? `${components} (${labels.materials})` : components
    });
  }

  // Concentration and ritual come from dnd5e as tags rather than as a field,
  // and they change how a spell is used enough to be worth stating plainly
  // rather than leaving to be inferred from the description.
  if ( labels.components?.tags?.length ) {
    facts.push({ label: "PHONEDRY.Describe.Tags", value: labels.components.tags.join(", ") });
  }

  return facts;
}

/* -------------------------------------------- */

/**
 * Prepare a description for display.
 *
 * @param {Document} doc  An item, or a rules journal page.
 * @returns {Promise<object|null>}
 */
export async function describeDocument(doc) {
  if ( !doc ) return null;

  const { TextEditor } = foundry.applications.ux;
  const source = sourceHtml(doc);

  let html = "";
  try {
    html = await TextEditor.implementation.enrichHTML(source, {
      // Roll data so inline formulas resolve against this character rather than
      // showing as raw references. A journal page has none to give, which is
      // why the call is optional rather than assumed.
      rollData: doc.getRollData?.() ?? {},
      relativeTo: doc,

      // GM-only notes stay hidden. A player holding their own spell should see
      // the spell, not whatever the GM wrote in the margin of it.
      secrets: false
    });
  } catch ( error ) {
    console.error("phonedry | could not enrich description", error);
    html = source;
  }

  const labels = doc.labels ?? {};

  return {
    name: doc.name,

    // A rules page has no artwork of its own; the panel simply omits the image.
    img: doc.img ?? null,

    // dnd5e composes each part — "1st Level", "Evocation" — so there is nothing
    // to assemble beyond joining them. Empty for a rules page, which has
    // neither.
    subtitle: [labels.level, labels.school].filter(Boolean).join(" · ") || null,

    // What it costs, how far it reaches, how long it lasts — the questions
    // asked before reading a word of the description, and previously only
    // answerable by reading all of it.
    facts: buildFacts(labels),

    html
  };
}
