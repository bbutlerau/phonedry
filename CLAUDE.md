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
- Safe-area insets matter on both — notches on iOS, punch-hole cutouts and
  gesture bars on Android — and both need `viewport-fit=cover` to report
  anything but zero.

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

The dev loop: the repo is bind-mounted into the Foundry container at
`/data/Data/modules/phonedry`, so edits are live immediately. `flags.hotReload`
is on, so Foundry reloads CSS and templates without a refresh; changes to `.mjs`
files still need a browser reload.

Foundry runs at **http://foundry.srv** (tailnet) or `localhost:30000`. Container
logs: `docker compose logs foundry` from `/home/server/docker`.

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
- The Foundry container's credentials live in `/home/server/docker/.env`, which
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

- **Dev/test Foundry:** Docker, `felddy/foundryvtt:13` (13.351), on the Ubuntu
  home server. Compose file at `/home/server/docker/docker-compose.yml`.
- **System:** dnd5e 5.3.3, with the official PHB, DMG and Monster Manual modules
  installed for realistic compendium data.
- **Test world:** `testing`.
- **Brad's own Foundry** normally runs on a MacBook Pro M4 Pro; the Docker
  instance exists so development doesn't depend on it.
- **Runtime:** whatever Node version Foundry v13 bundles (currently 22.x). The
  module itself ships unbundled and has no runtime dependencies.
