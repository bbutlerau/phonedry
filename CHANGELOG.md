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

### Fixed
- The shell rendered nothing at all: its Handlebars part declared two top-level
  elements without `root: true`, which made core throw inside the render
  promise. Because the canvas was disabled first, the failure presented as a
  blank screen rather than an error.
