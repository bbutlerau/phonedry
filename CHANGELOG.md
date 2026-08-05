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
- Long-press a roll to choose advantage or disadvantage. dnd5e decides between
  its roll dialog and a straight roll by reading modifier keys, which a phone
  does not have — without this every tap would open a desktop-shaped dialog.
- Death saves appear on the sheet only while the character is at zero hit
  points, showing successes and failures as pips with a roll button.
- Proficiency is shown as four distinct states — none, half, proficient and
  expertise — because dnd5e stores it as a multiplier and a checkbox would
  misrepresent two of the four.
- The sheet follows the character live: hit point changes, equipping armour and
  active effects being applied or removed all refresh it without a reload.
- Empty state for a player with no character assigned, which distinguishes
  owning none from owning several and says what to ask the GM for.
- Tablets lay the abilities out in a single row of six and split the skills
  into two columns, which fits the whole sheet on screen without scrolling.
- Unit tests for the actor-to-view-model mappers. These need no Foundry, no
  browser and no world, so unlike the smoke tests they can run in CI.

### Fixed
- Turning Phonedry off left the canvas disabled. `core.noCanvas` persists in
  client storage, so a client that had run Phonedry once kept a mapless
  tabletop afterwards — the escape hatch delivered players from a broken sheet
  into a broken tabletop. Phonedry now records that the change was its own and
  hands the canvas back on any load where it is not active, while leaving alone
  players who chose no-canvas mode themselves.
- The shell rendered nothing at all: its Handlebars part declared two top-level
  elements without `root: true`, which made core throw inside the render
  promise. Because the canvas was disabled first, the failure presented as a
  blank screen rather than an error.
