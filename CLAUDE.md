# CLAUDE.md — Project Memory & Working Agreement

## Learning mode

Brad chose **"Claude writes it"** for this project: implement fully, but explain
the reasoning as you go and comment anything non-obvious. This is not a silent
code-dump — the explanation is part of the deliverable. Don't re-ask this per
component; it was decided for the project as a whole.

## What this project is

- **App:** Phonedry, a Foundry VTT add-on module. Players connecting from a
  phone or tablet get a single full-screen D&D 5e character sheet instead of
  the full tabletop client.
- **Platform/OS target:** Runs in the browser on iOS and Android phones and
  tablets. Developed against a Foundry v13 instance in Docker on the Ubuntu
  home server; tested on iPad over Tailscale.
- **Language & stack:** Vanilla ES modules and plain CSS, no build step. Foundry
  loads `scripts/phonedry.mjs` directly as declared in `module.json`.
- **Interface type:** Web UI rendered inside Foundry via ApplicationV2.

## The core design constraint

The entire point of this module is that **the canvas never initialises**. Other
mobile modules keep the full client and skin it, so PIXI and every scene texture
still load, and iOS kills the tab. Phonedry forces core's `noCanvas` mode
instead.

Before adding any feature, ask whether it needs the canvas. If it does, it does
not belong in this module. Losing the map is the trade that buys the memory
headroom — treating it as a limitation to work around defeats the design.

Known consequences to design around, not fight:
- Token targeting via the API is unavailable; pick targets from the combat
  tracker instead.
- Scene switching is blocked while the canvas is off.

## Target devices

iOS and Android are both first-class: iPhone and iPad, and Pixel and Galaxy
phones on Chrome or Samsung Internet. Detection is capability-based rather than
user-agent based, so it covers all of them without a device list to maintain.

The two platforms fail differently, and both need testing:

- **Android resizes the viewport when the on-screen keyboard opens.** Anything
  reacting to `resize` must compare width, not height, or it will re-render the
  sheet out from under someone who is typing. iOS does not resize for the
  keyboard, so this class of bug is invisible on an iPad.
- **Android Chrome has pull-to-refresh.** A downward swipe at the top of a
  scroll container reloads the whole client unless `overscroll-behavior: none`
  is in force.
- **iOS is where the memory ceiling bites.** Android's limits are more generous,
  so a build that feels fine on a Pixel can still be killed on an iPhone.
- **Foundry's own dialogs render badly in WebKit.** ApplicationV2 dialog content
  collapses: the initiative roll dialog lost its formula, situational bonus
  field and roll-mode select, leaving a title and three buttons; the spell usage
  dialog shows a title and the first fieldset heading; the create-actor dialog
  offers one of its four actor types.

  Established by testing rather than assumed: it happens in iOS Safari, iOS
  Firefox and macOS Safari, and not in macOS Firefox — so it is WebKit, not iOS
  and not an extension. It also happens with this module inactive, so it is
  Foundry's bug rather than ours. But every browser on iOS is WebKit, so it
  lands on our users regardless.

  **Playwright's WebKit does not reproduce it.** It renders these dialogs
  correctly and reports geometry identical to Chromium, so the smoke tests
  cannot catch this class of problem and any fix for it has to be verified on a
  real Safari. `?phonedry=on` forces the module on for that.

  There is a fix in `styles/phonedry.css` under "Foundry dialogs in WebKit",
  confirmed on an iPhone: dialogs are sized to their content rather than to a
  height Foundry computes. It is scoped to this module, so it does nothing for
  the same bug on a desktop Safari — that one needs reporting upstream.

  The fix has since held on every dialog tried on a real iPhone: dnd5e's
  activity usage dialog (Turn Undead, with a consumption fieldset) and both
  rest dialogs (nested fieldsets, a `<select>` and a checkbox). That is enough
  variety to treat the fix as general rather than as three lucky cases, so a
  new dialog no longer needs to be assumed broken — but it still needs looking
  at on a device once, because Playwright's WebKit cannot see this class of
  bug at all.

  This is a problem to weigh, not a rule to apply. Work through it in order:

  1. **Is there an API that skips the dialog?** Initiative had one — the dialog
     was collecting an advantage mode the sheet already knew, then calling the
     method that does the real work. Cheapest possible outcome, so look here
     first.
  2. **Would rebuilding it mean reimplementing dnd5e's rules?** If so, stop and
     raise it. dnd5e's activity usage dialog handles spell slot selection,
     upcasting, and consumption of uses, resources and materials — that is a
     large amount of rules logic, and a hand-built version of it would be
     wrong in ways nobody notices until a session. The same goes for resting
     and hit dice. A dialog that needs CSS coaxing is a far better trade than
     owning that logic ourselves.
  3. **Can the dialog be fixed?** WebKit is in the smoke tests now, so this can
     actually be checked rather than guessed at, which was not true when the
     initiative dialog was removed. A scoped stylesheet fix under
     `.phonedry-active` leaves desktop players untouched and is worth trying
     before anything is rewritten.

  Build from scratch only when the dialog is thin — a choice the sheet already
  knows the answer to, or a confirmation. Say which of these applies before
  writing the code.
- **Long-press needs `user-select: none` and `-webkit-touch-callout: none`.**
  Without both, iOS claims a hold to start a text selection and raises its Copy
  / Look Up callout over the app; `preventDefault` on `contextmenu` does not
  stop it. The sheet sets both, so the gesture works — but it took removing an
  advantage long-press to find that out, and the two were not in place together
  until later.

  It is still not the way to offer a *primary* action: a gesture is unmarked
  and undiscoverable, which is why advantage is a visible control. It suits
  secondary, inspect-style actions on rows whose obvious targets are already
  spoken for — holding a spell for its description — and even then the sheet
  says so in words. A hold that fires must also suppress the click that
  follows, or it does both things at once.
- Safe-area insets matter on both — notches on iOS, punch-hole cutouts and
  gesture bars on Android — and both need `viewport-fit=cover` to report
  anything but zero.

## Where to look things up

For questions about **Foundry's behaviour**, read the bundled source in the
container before reaching for documentation:

```bash
docker exec foundry grep -n "<symbol>" /home/node/resources/app/public/scripts/foundry.mjs
```

That file is the exact build in use, and it has been decisive every time so
far — hook ordering during startup, the `root: true` requirement on Handlebars
parts, the permanent resolution notification, the persistence of
`core.noCanvas`. These are behavioural details that documentation either
glosses or omits, and each one presented as a blank screen rather than an
error. Core's own classes are also the best reference for how an
ApplicationV2 subclass should be configured: find one doing the same job and
match it.

Context7 (`plugin:context7`) is the right tool for **API surface** questions,
particularly dnd5e's data model, which shifts between majors — the Activities
rework in 5.x being the obvious case. Also useful for Playwright and Vitest
configuration rather than guessing at options.

The distinction: source for *how Foundry behaves*, Context7 for *what an API
offers*. When they disagree, the container wins.

## Rules that keep the module correct

- **Never reimplement dnd5e's rules.** Every roll delegates to the system's own
  API. We own the interface; dnd5e owns the rules. This is what keeps chat
  cards, active effects and third-party roll modules working.
- **dnd5e 5.x uses Activities.** Target that model, not the legacy item-use path.
- **Mappers are the test surface.** `actor → view model` transforms are pure and
  synchronous, and they are what breaks when dnd5e changes its data model. Test
  those; don't bother unit-testing rendering.

## Versioning, changelog and tagging

- Follow [semantic versioning](https://semver.org/). The `version` field in
  `module.json` is the single source of truth, and the release workflow fails
  the build if a pushed tag disagrees with it.
- Every user-visible change gets a `CHANGELOG.md` entry under `## [Unreleased]`
  as part of the change itself, not retrofitted at release time. Use Keep a
  Changelog headings (Added / Changed / Fixed / Removed).
- Releasing means: move `[Unreleased]` entries under a new `## [x.y.z] — DATE`
  heading, bump `module.json`, commit, then tag `vX.Y.Z` and push with `--tags`.
  Pushing the tag is what triggers the release workflow.
- Never bump the version or create a tag without being asked to cut a release.

## Workflow

Follow explore → plan → code → verify for anything beyond a trivial one-file
change.

- For multi-file features, list the files you intend to touch before editing.
- Don't leave stubs, TODOs, or placeholder functions in code presented as
  finished. Implement fully, or say plainly what's incomplete and why.
- Work in milestones (M0 scaffold, M1 boot path, M2+ sheet content). Stop at the
  end of a milestone for real-device testing rather than running several
  together — the iPad is the only honest verdict on whether this works.

## Verification

Verify your own work as part of finishing a task rather than waiting to be told.
No need to narrate every check. Say plainly if something didn't work or you're
unsure.

Run the tests before calling a milestone done:

```bash
npm test           # unit + Chromium smoke tests; ~2 minutes
npm run test:unit  # mappers only — no Foundry, no browser, instant
npm run test:webkit # the same smoke tests under WebKit
npm run test:all   # everything, both engines; ~6 minutes
```

WebKit is deliberately not in the default run. It roughly doubles the time, and
a dev loop that takes six minutes stops being run. Use it before calling a
milestone done, and any time the change is to layout, gestures, input handling
or anything touching a Foundry dialog — those are the areas where the two
engines have actually disagreed.

Smoke tests are expensive: each one joins a world, and that is most of its
eight seconds. Prefer adding assertions to an existing test over adding a new
one, unless the new case genuinely needs a different viewport or a fresh
client.

The unit tests cover the actor → view model mappers, use Node's built-in test
runner rather than a framework, and are the part that can run in CI.

The smoke tests can run against both Chromium and WebKit, and the second is not
a formality. Every browser on iOS is WebKit, so half the target devices run
an engine Chromium testing says nothing about — and the two worst bugs so far,
the long-press that iOS turned into a text selection and the Foundry dialog
that rendered with its middle collapsed, were both invisible in Chromium and
both reached a real device first. WebKit here is not Safari and not iOS: no
touch callout, no memory ceiling. It shares the engine, which is where layout
bugs of this kind live. The iPad is still the final word.

The smoke tests drive the real Foundry instance rather than a mock,
deliberately: every bug so far has come from core behaving differently than
expected, and a mocked Foundry would faithfully reproduce our own assumptions
and catch none of them. They cannot run in CI, because Foundry needs a licence
and a world.

They join as the player `phonedrt`, who has the level 7 cleric "phonedry test"
assigned. Override with `PHONEDRY_TEST_USER`. Joining as a GM with no assigned
character only ever exercises the empty state.

A test that passes alone but fails in the suite is usually persisted client
state leaking between contexts — `core.noCanvas` in particular survives a page
load, which is exactly the bug the escape-hatch test caught.

The dev loop: the repo is bind-mounted into the Foundry container at
`/data/Data/modules/phonedry`, so edits are live immediately. `flags.hotReload`
is on, so Foundry reloads CSS and templates without a refresh; changes to `.mjs`
files still need a browser reload.

The development Foundry runs in Docker and answers on `localhost:30000`.
Container logs: `docker compose logs foundry`, from wherever the compose file
lives — it is outside this repository.

Use `docker compose stop foundry && docker compose up -d foundry` rather than
`docker compose restart foundry`. Restart brings the container back before
Foundry has released `Config/options.json.lock`, and it then refuses to start
against what it sees as a locked directory. If that happens, `rmdir` the lock
(it is a directory, not a file) and start again.

## Code review

Report every issue noticed, including minor or stylistic ones — don't
self-filter to "high severity only". Tag each issue's severity for triage.

## Security — this repo is public on GitHub

Phonedry needs no credentials, makes no external network calls, and stores
nothing outside Foundry's own documents. Keep it that way: if a feature ever
seems to need a secret, raise it before building it.

- Never write API keys, tokens, passwords, or personal file paths into tracked
  files.
- The Foundry container's credentials live in the Docker stack's `.env`, which
  is outside this repo. Treat that file as off-limits to read, print or log.
- Confirm before `git push`, adding a dependency from an unfamiliar source, or
  any command that deletes files or changes system settings.
- Sample and test data must not resemble real personal information.

## Style & output

- Write documentation and comments in plain prose — full sentences, not
  everything forced into bullet lists.
- Comments should explain *why*, not restate *what* the code does.
- Match the existing code style; ask before introducing a new convention.
- Keep generated docs proportional. Cover the substance, skip the padding.

## Environment notes

- **Dev/test Foundry:** Docker, `felddy/foundryvtt:13` (13.351). The compose
  file lives outside this repository.
- **System:** dnd5e 5.3.3, with the official PHB, DMG and Monster Manual modules
  installed for realistic compendium data.
- **Test world:** `testing`.
- Brad's own Foundry normally runs on his laptop; the Docker instance exists so
  development doesn't depend on it.
- **Runtime:** whatever Node version Foundry v13 bundles (currently 22.x). The
  module itself ships unbundled and has no runtime dependencies.
