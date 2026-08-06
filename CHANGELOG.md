# Changelog

All notable changes to Phonedry are recorded here. Versions follow
[semantic versioning](https://semver.org/).

## [Unreleased]

### Added
- Initial project scaffold: module manifest, licence, and release workflow.
- Boot path: forces Foundry's `noCanvas` mode on mobile clients so PIXI and the
  scene canvas are never initialised, and replaces the core tabletop UI
  applications with non-rendering subclasses so they are never built.
- Full-screen shell application, rendered in place of the tabletop.
- `viewport-fit=cover` is appended to Foundry's viewport meta so CSS safe-area
  insets report real values on notched and cutout displays.
- Client setting to force the mobile client on or off, overriding detection.
- `?phonedry=off` URL override, which bypasses the module for a single page
  load. This is the only route back to the tabletop once the sidebar is
  suppressed, so it matters on a phone where clearing site data is otherwise the
  only recourse.
- A plain-DOM failure panel shown if the sheet cannot render, replacing what was
  previously a silent blank screen.
- Two guaranteed-noise core notifications are filtered: the permanent
  "window too small" resolution error, which no phone can satisfy and which
  swallowed taps where it overlapped the sheet, and the "scene not displayed
  because the canvas is disabled" notice, which describes the design rather
  than a problem.

- Playwright boot smoke tests covering activation on touch devices, the tablet
  layout, non-activation on desktop, and the `?phonedry=off` escape hatch.

- Stats screen: hit points with a bar, armour class, initiative, speed,
  proficiency bonus, spell save DC and exhaustion in a header that stays put
  while the sheet scrolls, followed by the six abilities and the full skill
  list. Skills are sorted alphabetically rather than by dnd5e's key order,
  which is the only order that can be navigated on a phone.
- Rolling: every ability check, saving throw and skill check is a tap, and each
  delegates to dnd5e's own API so chat cards, active effects and third-party
  roll modules keep working. Initiative rolls from the header.
- An advantage selector in the header, applying to every roll on the sheet.
  dnd5e decides between its roll dialog and a straight roll by reading modifier
  keys, which a phone does not have — without this every tap would open a
  desktop-shaped dialog. It is sticky, so advantage granted for a whole fight
  is set once, and every roll control is tinted while it is not normal so a
  forgotten setting cannot quietly skew a session.
- Text selection is disabled across the sheet, which stops iOS turning a slow
  tap on a label into a Copy / Look Up callout over the top of it.
- Hit points can be edited from the sheet. Tapping the bar — the largest
  target on the screen, for the thing reached for most often mid-fight — opens
  an amount field with Damage, Heal and Temp buttons, plus steppers for
  adjusting by one without raising the keyboard. Direction is chosen by the
  button rather than by a minus sign, so "damage 5" and "heal 5" cannot be
  confused. The arithmetic is dnd5e's: temporary hit points absorb damage
  first, healing stops at the maximum, and damage stops at zero.
- Initiative is a tap like every other roll, with no Foundry dialog involved.
  It uses the sheet's advantage selector and files the result with the combat
  tracker exactly as before.
- A roll log at the bottom of the sheet, showing what was rolled and what it
  came to. Foundry reports results in chat, chat lives in the sidebar, and this
  module suppresses the sidebar — so until now every roll the sheet made was
  correct and invisible. The bar shows the latest roll and opens into the last
  twenty. Individual dice are shown with the one advantage discarded struck
  through, since otherwise an advantage roll looks like a single d20
  disagreeing with its own total, and naturals and criticals are marked using
  dnd5e's judgement rather than a comparison against 20.
- Death saves appear on the sheet only while the character is at zero hit
  points, showing successes and failures as pips with a roll button.
- Proficiency is shown as four distinct states — none, half, proficient and
  expertise — because dnd5e stores it as a multiplier and a checkbox would
  misrepresent two of the four.
- The sheet follows the character live: hit point changes, equipping armour and
  active effects being applied or removed all refresh it without a reload.
- Empty state for a player with no character assigned, which distinguishes
  owning none from owning several and says what to ask the GM for.
- Phones are held upright. A phone turned sideways gets a prompt to turn it
  back rather than a sheet squeezed into a few hundred pixels of height. There
  is no way to genuinely lock orientation on the web — the Screen Orientation
  API needs fullscreen and iOS Safari does not implement the lock at all — so a
  prompt is the whole of what the platform offers. Tablets still rotate freely.
- Tablets lay the abilities out in a single row of six and split the skills
  into two columns, which fits the whole sheet on screen without scrolling.
- The smoke tests run against WebKit as well as Chromium. Every browser on iOS
  is WebKit, so half the target devices were running an engine nothing tested.
- A tab bar at the bottom of the sheet for moving between sections. A visible
  bar rather than an edge swipe: iOS Safari uses a swipe from the left edge for
  back and the right edge for forward, Android's system back gesture claims
  both edges too, and a web page cannot reliably prevent either — losing that
  race navigates away from the game entirely.
- Spells screen: slots at the top, then spells grouped by level and sorted by
  name within each. Preparation toggles for spells the character actually
  prepares, casting through dnd5e's own activity pipeline, and badges for
  concentration, ritual and limited uses.
- Spells granted by something other than the character's class — a subclass, a
  species, a feat — are marked with a coloured stripe and the name of whatever
  granted them. This is the answer to a question ordinary sheets leave open:
  why the same spell appears on the list twice. Class spells are left unmarked,
  because marking the ordinary case would leave nothing standing out.
- Spells can be added from the compendium. Search by name across the spell
  lists dnd5e holds for the character's classes, tap to add. Spells already on
  the sheet are shown greyed and labelled rather than filtered out, so a search
  that finds one is not mistaken for a search that failed.

  Duplicates are collapsed: with the Player's Handbook module installed every
  spell exists twice, once in dnd5e's own pack, and offering both would be two
  identical rows with nothing to choose between them.

  Results can be ordered by name, level or school. Levels and schools are not
  in the compendium index Foundry builds by default, and asking for them
  afterwards costs a re-index of about ten seconds — so Phonedry declares them
  as index fields at startup instead, which adds them to the index Foundry was
  going to build anyway. The browser still opens in well under a second.
- Holding a spell opens a panel describing what it does, enriched by Foundry so
  inline rolls and rule references read as text rather than as markup. Holding
  does not also cast: the tap that follows a hold is suppressed, or reading a
  spell would spend a slot.
- A log out control in the header. Suppressing the sidebar takes Foundry's own
  logout with it, so there was no way to change user from a phone at all.
- Holding a spell in the compendium browser shows what it does before adding
  it, which is when a player most wants to know.
- Actions screen, between stats and spells: everything the character can do on
  their turn that is not a spell, grouped by what it costs — actions, then
  bonus actions, then reactions. Attack rows carry their to-hit and damage;
  limited-use features carry their remaining uses. Holding a row describes it,
  as on the spells screen.

  A row is an *activity*, not an item. Channel Divinity is one item carrying
  three activities over a single pool of uses, so each gets its own row and a
  tap does the thing rather than opening a dialog to ask which was meant.

  Weapons and equipment appear only while equipped, since a greatsword at the
  bottom of the pack is not an attack you can make this turn. Consumables and
  features are always listed, because a flask of holy water is thrown from the
  pack. Spells stay on their own screen rather than appearing in both places.

  Duplicate stacks of one item fold into a single row with their charges
  summed, so two flasks of holy water read as one entry with two throws left.
  The tap spends whichever stack still has a charge, which is what makes the
  second flask reachable once the first is empty.

  Each row carries a coloured stripe and a word for what kind of thing it is —
  weapon, feature, consumable, equipment, tool — following the spell source
  stripes, where the colour says the rows differ and the word says how. Rows
  are ordered by kind before name, so a group reads as blocks matching those
  colours with attacks at the top, rather than as an alphabetical jumble of a
  mace, a lamp and a domain feature.
- Short and long rest, in the header where they are always reachable, and hit
  dice alongside the other vitals so a player can tell before resting whether
  resting is worth anything.

  Both open dnd5e's own rest dialog rather than suppressing it. That is the
  opposite of the choice made for initiative, and right for the same reason it
  was wrong there: initiative's dialog only collected an advantage mode the
  sheet already knew, whereas this one is *where hit dice are spent*. Removing
  it would mean rebuilding hit dice, slot recovery, limited-use recovery,
  exhaustion and the rest variants.

  Without this there was no way to recover spell slots, limited uses or hit
  points from a phone at all, which made a whole session unplayable from one.

  To make room, hit points now share their row with the rest buttons instead of
  spanning the full width, and the advantage selector is shorter. It stays an
  easy target because it spans the whole width — the height was paying for
  nothing. The header ends up shorter than before despite gaining two controls.
- Status screen: the standard D&D conditions as a grid of toggles, and
  separately, whatever is currently affecting the character. Holding a
  condition shows the rule it applies.

  The two are deliberately not one list. A condition is a switch the player
  owns — you are prone because you dropped prone. An effect is a record of
  something that arrived from elsewhere: a Bless someone cast, a Rage a feature
  turned on. Presenting them alike would invite a player to switch off a spell
  someone else is concentrating on and assume that ended it, so effects are
  rows rather than chips and the screen says in words that turning one off
  stops it applying to you rather than ending it.

  Toggling goes through core's own `toggleStatusEffect`, so a condition is
  recognised as that condition by dnd5e, the token HUD and other modules; an
  effect built by hand would look identical and be none of those things.
  Exhaustion is a level rather than a switch, and writing the level is the
  whole of the work — dnd5e derives the penalties from it.

  Only temporary effects are listed. Passive ones are a character's permanent
  traits rather than things happening to them, and including them would bury
  the Bless among entries nobody needs mid-fight.
- Targeting for spells aimed at creatures. Casting one asks who first, listing
  the active encounter's combatants — enemies before allies, with portraits and
  armour classes — or the party when no fight is running.

  This exists because of the canvas. Everywhere else in Foundry you target by
  clicking tokens on a map, and this module never builds one, so a phone player
  had no way to say who they were casting at. The documents behind the map are
  still reachable and carry everything the tokens were showing.

  The chosen targets are handed to dnd5e as the message flags it would have
  built from the canvas itself, so its chat card names them, shows their armour
  classes, and offers per-target save buttons exactly as on a desktop. They are
  also broadcast, so a GM watching the map sees the tokens highlighted — though
  that part is best-effort, since Foundry drops it if the caster is not viewing
  the same scene.

  Template spells are deliberately excluded. A fireball is aimed at a patch of
  ground, and who is caught in it needs the map this client does not draw —
  offering a name list would invite a player to pick three and believe the area
  had been resolved.

  Casting without choosing anyone stays available throughout. Plenty of tables
  resolve targeting by talking, and a sheet that refused to cast until someone
  was ticked would be worse than the problem this solves.
- Artwork that fails to load falls back to a silhouette instead of a browser
  broken-image glyph. Missing art is ordinary — a module uninstalled, a world
  copied without its user files — and a row of broken glyphs reads as the sheet
  being broken rather than as one picture being absent.
- Descriptions now lead with the facts: casting time, range, target, duration
  and components, above the text rather than buried in it. Answering "how long
  does this take and how far does it reach" previously meant reading the whole
  description.

  Every value is dnd5e's own composed string. Casting time and range each come
  from several fields and vary by rules version, so deriving them would be
  reimplementing the system to arrive at a string it has already written.

  It applies to more than spells — a feature and a weapon carry the same
  labels, so holding either answers the same questions — and rows with nothing
  to say are left out rather than shown blank.

  Weapons add their attack bonus and damage, armour its armour class, and both
  their properties — Finesse, Loading, Stealth Disadvantage. Damage carries its
  type here, unlike on an action row: the actions screen shows the bare formula
  because "1d10 + 3 Piercing" does not fit a phone row, while a panel has the
  width and resistance is exactly what someone opens one to check.

  This matters more than it sounds. dnd5e ships chain mail, a mace and a pistol
  with no description text at all, so holding one previously gave a name and an
  empty box. Where there genuinely is nothing written, the panel now says so
  rather than showing a blank that reads as a failure to load.
- Holding an action shows what it does, as on the spells screen. dnd5e gives an
  activity no description of its own, so this is the item's rules text — which
  is the useful thing to read anyway.
- Holding a skill shows the rule it covers, read from dnd5e's own reference
  compendium. A skill is not an item and has no description, and what a player
  wants mid-session is what the skill is *for* rather than how its number was
  arrived at. Skills whose rule page is not installed simply offer no hold,
  rather than a hold that opens nothing and swallows the roll.
- Inventory screen, between spells and status: everything the character is
  carrying, with an equip toggle on every row that has one.

  Equipping is why the screen exists. The actions screen lists weapons and
  equipment only while they are equipped, so before this a player who drew a
  different weapon mid-fight had no way to make it appear — the sheet showed
  them what they could do and offered no way to change it.

  Belongings are grouped by *where they are* rather than by what kind of thing
  they are. A character carrying two lamps, one in hand and one at the bottom
  of the pack, gets two rows either way; grouped by type they are an
  unexplained duplicate, and grouped by container they are two obvious facts. A
  container heads its own group and carries its own equip toggle and the weight
  of everything inside it, rather than also appearing as a row somewhere else
  under the same name.

  Rows carry the same coloured stripe and kind label as the actions screen, so
  a weapon in one place looks like the same claim as a weapon in the other.
  Tapping a row reads it — nothing else competes for the tap, since using an
  item lives on the actions screen — and holding one does the same, so the
  gesture learned on the spells screen keeps working.

  Above the list: carried weight against capacity, the purse, and how many
  attunements are in use. Only exceeding carrying capacity is marked. dnd5e
  knows two thresholds below it, but both belong to an optional variant rule,
  and colouring a sheet for a rule the table may not be playing would tell the
  player something untrue.

- Gear can be added from the compendium, the same way spells already could. An
  "Add gear" button on the inventory screen opens a search over every item
  compendium the world has — dnd5e's own packs plus whatever modules are
  installed — and a tap adds it. Holding a result reads it before committing.

  One panel serves both browsers rather than two near-copies. They differ in
  where their entries come from and in what a row's second line says, and in
  nothing else: the same search field, debounce, result cap and hold-to-read.

  Two things are different for gear, both deliberate. Nothing is marked as
  already owned — a character can perfectly well carry a second rope and a
  third torch, so refusing a duplicate would refuse the most ordinary use of
  the screen. And results are deduplicated by *name* as well as by identifier:
  gear is published under both rules versions and again by the Player's
  Handbook and Dungeon Master's Guide modules, so a search for "chain mail"
  otherwise returned the same armour four times with nothing to choose between.

  Only compendia the player can actually see are searched. A GM's private
  homebrew pack is hidden from players in Foundry's own sidebar, and a phone
  client that listed its contents anyway would be handing out something the GM
  chose to keep back.

- Attunement can be toggled from an item's row, where the item has anything to
  say about attunement. It is counted rather than enforced: dnd5e counts
  attunements and leaves the ruling to the table, and a sheet that refused the
  tap would be enforcing a rule the system does not, from a phone, mid-session.
- Inspiration is a chip in the header, beside the other vitals and directly
  above the advantage selector it is spent to gain. It toggles both ways rather
  than only being spendable: a mis-tap on a phone would otherwise cost a player
  their inspiration with no way back except asking the GM. Always shown, even
  when not held — a chip that appeared only while inspired would make its own
  absence unreadable.

- Concentration is surfaced at the top of the status screen, with the save
  bonus on the button that rolls it and a control to drop it. This is the thing
  most often forgotten at a table: a spell quietly stays running for an hour of
  play after the damage that should have ended it, because nothing on the sheet
  ever mentions it again.

  It previously appeared as one row among "Affecting you", named like
  everything else and indistinguishable from a Bless someone else was
  maintaining. It is now excluded from that list, so it appears exactly once.
  dnd5e marks concentration through core's special status effects rather than
  through its own condition types, so the filter that already drops conditions
  from that list did not catch it.

  Rolling the save does not end concentration either way — that is the GM's
  call on the result, and a sheet that dropped it on the roll would be
  inventing a rule.

- Features screen, last in the tab bar: everything a class, species, background
  or feat gave the character that they do not activate — Spellcasting, Gnomish
  Cunning, Observant — grouped by where it came from. Tapping or holding a row
  reads it.

  These were previously invisible. The actions screen lists activities, so
  anything with none appeared nowhere at all, and there was no way to read what
  your own character could do from a phone.

  A feature belongs on this screen exactly when the actions screen does not
  show it, and that is the correctness condition rather than a rule of thumb:
  the two partition the character's features between them, and anything falling
  between the two is invisible again. The test is imported from the actions
  mapper rather than restated, and both the unit tests and the smoke test check
  the partition directly against every feature on the character.

- Traits, on the same screen below the features: damage resistances,
  immunities and vulnerabilities, condition immunities, languages, armour and
  weapon proficiencies, and size.

  Resistances and immunities are shown as a block of four rows or not at all.
  Individually they would be ambiguous — a missing "Resistances" row could mean
  the character resists nothing or that the sheet does not show resistances,
  and on the screen checked before taking damage that difference matters.
  Shown together, an empty row inside the block is a definite "none".

  Where something gets through a resistance anyway — a magical weapon against
  resistance to bludgeoning — that is stated rather than left in dnd5e's
  separate and easily forgotten field.

- Tool proficiencies are rollable checks under the skills list, sharing the
  skill row exactly so the two line up down the screen. Only the tools the
  character is actually trained in: dnd5e knows about forty and a character has
  one or two, so listing the rest would bury the ones that matter. That is the
  opposite of the rule for skills, where every skill is rollable whether
  proficient or not, and right for the opposite reason — an untrained skill
  check is ordinary, an untrained tool check is the GM saying you may try.

- Unit tests for the actor-to-view-model mappers. These need no Foundry, no
  browser and no world, so unlike the smoke tests they can run in CI.

- A character switcher, for a player who owns more than one actor. Holding the
  portrait or name in the header opens a dimmed panel listing the player's
  other owned characters; tapping one switches the sheet to show it.

- A smite or an attack cantrip now also appears on the actions screen, beside
  the weapon it modifies or the same way a weapon attack does, rather than
  living only on the spells screen where a fight has no reason to look for it.

### Fixed
- The highest spell slot box stood taller than the rest. The grid row measures a
  few pixels taller than any slot in it, and the default stretch filled that gap
  for the last slot only. Each box now sizes to its own content, so they match.
- Every button in the sheet rendered at 16px regardless of the size the
  stylesheet asked for. The shared rule that normalises button typography used
  the `font` shorthand at a selector one class heavier than the per-button rules
  below it, so nine separate font sizes — the tab bar, the advantage selector,
  the ability check buttons, the browser controls and others — silently never
  applied.

  It went unnoticed for as long as nothing depended on the difference. What
  exposed it was the tab bar reaching six tabs, at which point "Features" was
  too wide for its cell and sat hard against the edge of the screen on a real
  iPhone. Both Chromium and Playwright's WebKit rendered the same layout as a
  snug fit, so no test saw it.

  The normalisation now sits one class weaker, which still beats the browser
  default and Foundry's own button rule while losing to anything more specific
  in this stylesheet — the order that was always intended. The nine sizes now
  take effect, so several controls are a little smaller and the ability check
  buttons a little larger.

- Following a link inside a description trapped the player. Descriptions are
  full of them — Radiance of the Dawn cites Darkness — and Foundry answers a
  click by opening that document's own sheet: a desktop application, sized for
  a desktop, whose close button lands off the edge of a phone screen. With the
  sidebar suppressed there was then no way back short of reloading the client.

  Links are now answered inside the description panel, which can already render
  both a rules page and an item — so a cited rule opens in the same box rather
  than in a window over the top of it.

  Following one keeps a trail. While there is something behind it, both the
  panel's control and a tap on the dimmed area go back rather than dismissing,
  and the control shows a back arrow instead of a cross to say so: reading a
  cited rule should not cost you the rule you were reading it from. Only at
  the root does either one close the panel.
- The description panel put its close button on the left and squeezed the title
  into a corner whenever the subject had no artwork — which is every rule page,
  so every held skill and condition. The head counted on always having an icon
  to fill its first column.
- The description panel could only be dismissed by its close button, which sits
  at the top of a panel anchored to the bottom of the screen — so on a tall
  phone it is in the middle, and reaching past it to tap the dimmed area above
  does nothing. That area now dismisses the panel, as it does in any other
  bottom sheet on either platform.
- Preparing a spell scrolled the list back to the top. Preparing updates the
  item, which re-renders the sheet, and a replaced element starts at the top —
  so a player working down their spell list was thrown back after every one,
  and the further down they were, the worse it got. The scrolling parts now
  declare themselves to core, which preserves the position across a re-render.

  Switching tab, searching and re-sorting still return to the top, because
  there the content changes identity: a position measured against the old list
  would land the player halfway down one they have not seen the top of.
- A `?phonedry=` override was lost whenever it was needed most. Opening
  `/game?phonedry=off` while not logged in sends Foundry to its join page,
  which does not load modules, and joining lands back on `/game` with the query
  gone — so the escape hatch from a sheet that will not render silently did
  nothing. Overrides are now remembered for the life of the browser tab, and
  `?phonedry=auto` gives detection back.
- Foundry's dialogs rendered with their content collapsed in WebKit, which
  affects every browser on iOS: the spell usage dialog stopped after its first
  heading, showing neither the slot selector nor the cast button. Dialogs are
  now sized to their content and capped against the viewport rather than
  depending on a height Foundry computes, which comes out short there.
- Initiative opened Foundry's roll configuration dialog, which renders badly on
  iOS: the whole middle of the window — the formula, the situational bonus
  field and the roll mode select — collapsed to nothing, leaving a title and
  three buttons. The dialog turned out to be avoidable entirely; it was
  collecting an advantage mode the sheet already knew, then calling the method
  that does the real work.
- Turning Phonedry off left the canvas disabled. `core.noCanvas` persists in
  client storage, so a client that had run Phonedry once kept a mapless
  tabletop afterwards — the escape hatch delivered players from a broken sheet
  into a broken tabletop. Phonedry now records that the change was its own and
  hands the canvas back on any load where it is not active, while leaving alone
  players who chose no-canvas mode themselves.
- A phone in landscape was given the tablet layout. At 852px wide it cleared
  the 768px breakpoint, so six ability boxes were laid out in a row on a screen
  393px tall. Both the media query and the matching check in script now require
  a minimum height as well as a width.
- The initiative box sat shorter than the readouts beside it, and one ability
  box — always the last — was a few pixels taller than the other five. Foundry
  sets an explicit height on buttons, which makes a grid cell ignore
  `align-self: stretch` entirely; the ability boxes now state their height
  rather than leaving it for the grid to work out.
- The shell rendered nothing at all: its Handlebars part declared two top-level
  elements without `root: true`, which made core throw inside the render
  promise. Because the canvas was disabled first, the failure presented as a
  blank screen rather than an error.
