# CLAUDE.md — Project Memory & Working Agreement

## Read `session.md` first

Before anything else in a new session, read `session.md` in the repository root
if it is there. It is the running handover: what was finished last, what is
outstanding, what still needs checking on a real device, and which decisions
were already made and should not be reopened.

It is deliberately untracked — local working state rather than documentation of
the module — so a fresh clone will not have one. Its absence is normal, not a
problem to fix. Keep it current as work lands, and treat anything durable in it
(an API constraint, a behaviour of Foundry) as belonging here in CLAUDE.md
instead, where it survives.

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

## What we have learned about Foundry and dnd5e

Hard-won facts, each of which cost real time to establish. They are here rather
than in a session note because they outlive any one piece of work.

### Consequences of running without a canvas

- **`game.user.targets` can never be populated.** Core's targeting reads
  `canvas.tokens` and `canvas.scene`, so on a canvas-free client the target set
  stays empty permanently. This is not cosmetic: dnd5e builds a chat card's
  target list from that set, so every card the module produced named nobody.

  The way through is that `Activity#use(usage, dialog, message)` merges the
  `message` argument over its own defaults, so target descriptors can be handed
  in as `data.flags.dnd5e.targets` in dnd5e's own shape — `{name, img, uuid,
  ac}`. That restores target names, armour classes and per-target save buttons.
  `Item#use` forwards all three arguments, so casting through the item works
  the same way.
- **Everything behind the map is still reachable.** Combatants, their tokens'
  dispositions, actors and their armour classes are documents, so the combat
  tracker is a complete substitute for picking tokens off a map.
- **`user.broadcastActivity({targets})` needs no canvas to send**, and other
  clients answer it by highlighting those tokens. It is best-effort only:
  Foundry drops it when the sender is not viewing the same scene, and a
  canvas-free client cannot confirm it landed.

### Applying effects

- **dnd5e refuses unless you are the GM or own the target.**
  `_applyEffectToActor` throws on anything else, and there is no GM relay socket
  in the system to fall back on. A player on a phone typically owns none of the
  enemies and none of the other characters, so applying effects from the phone
  is not generally possible.
- **A save-based spell's effect applies to whoever fails the save**, which is
  why dnd5e puts a button on the card rather than applying on use. Applying at
  cast time would be a rules error, not merely eager.
- Brad's decision: effect application stays entirely with the GM's chat card.
  Do not build auto-application or a GM relay without asking again.

### ApplicationV2

- **A part may declare `scrollable: [selector]`**, and core preserves those
  scroll positions across a re-render. `""` means the part's own root element.
  Without it, anything that re-renders the sheet — preparing a spell, taking
  damage — throws the list back to the top.

  Preserving is only right when the same list is being rebuilt. When the content
  changes identity — a new tab, a new search, a re-sort — reset to the top, or
  the player lands halfway down a list they have not seen the top of.
- **Each part still renders exactly one top-level element.** See the note under
  the design constraint; this remains the most common cause of a blank screen.

### Enriched text

- **Content links open a desktop document sheet.** `a.content-link[data-uuid]`
  is answered by Foundry opening that document's own application, which on a
  phone lands with its close control off the edge of the screen — and with the
  sidebar suppressed there is no way back short of reloading. Intercept the
  click on the shell root and answer it in the module's own panel. Both
  `preventDefault` and `stopPropagation` are needed; the handler that opens the
  sheet is at document level.
- **An item keeps its text in `system.description.value`; a journal page in
  `text.content`.** Skills and conditions point at rules pages through
  `CONFIG.DND5E.skills[key].reference` and `conditionTypes[key].reference`, so
  holding one can show the actual rule.
- **An activity has no description of its own** — only an empty `chatFlavor` —
  so an action row's description is the item's.
- **`item.labels` already carries display strings** for activation, range,
  target, duration, components, materials, `toHit` and `damages`. Use them
  rather than deriving; they vary by rules version and dnd5e has already done
  the work.

### Conditions and effects

- **`CONFIG.DND5E.conditionTypes` entries flagged `pseudo` are not conditions**
  in the rules — they are internal markers. dnd5e filters them out of its own
  effects tab and so should we.
- **`Actor#toggleStatusEffect(id, {active})` is the only correct route.** It
  creates the effect with the right static id, so dnd5e, the token HUD and other
  modules recognise it. `actor.statuses` is then the honest answer to "is this
  on", including reading false for a disabled effect.
- **Exhaustion is a level, not a switch** — `CONFIG.DND5E.conditionTypes
  .exhaustion.levels` — and writing `system.attributes.exhaustion` is the whole
  of the work; dnd5e derives the penalties.
- **`effect.isTemporary` separates** something cast on you from a permanent
  trait, which is the line worth drawing on a status screen.

### Rests

- `Actor#shortRest()` / `longRest()` open dnd5e's rest dialog, and that dialog
  is *where hit dice are spent*. Keep it. Hit dice live at
  `system.attributes.hd` with `value`, `max` and `largestAvailable`.

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

## Publishing: the official package listing is closed to this codebase

Foundry's [AI policy](https://foundryvtt.com/article/ai-policy/) governs what may
be submitted to the official package repository. Brad read it and decided
Phonedry as it stands does not qualify. He agrees with the policy; this is not a
constraint to look for a way around.

Read carefully, the policy does *not* prohibit AI-written code — it permits
"AI-generated code, code completion, refactoring suggestions, debugging
assistance". What it prohibits is "generating large blocks of code through AI
prompting without understanding the results". The bar it sets is that "an author
must be able to understand, explain, modify, and maintain every part of their
submitted codebase".

Two things therefore disqualify this codebase, and the second is the one that is
easy to miss:

1. **Learning mode is "Claude writes it."** That was the right choice for
   getting a working sheet onto a phone, and it is the wrong basis for a
   submission under this policy.
2. **The commit history is the evidence they inspect.** The policy asks for "a
   commit history that demonstrates iteration and authorship", and lists
   "examining commit history" among its investigation methods. This repository
   has a handful of large batch commits, each co-authored by Claude — which is
   honest, and close to the opposite of what that asks for. It cannot be
   retrofitted.

What this does *not* block is distribution. The release workflow, tags and
GitHub releases are unaffected, and players can install from a manifest URL. Only
the official listing is closed.

The plan is a V2: a rewrite by Brad with Claude assisting rather than
implementing, in its own repository with a clean history from the first commit.
Settle the commit granularity at the start — comprehension can be demonstrated
in an interview, but a history showing iteration has to be built as the work
happens.

The full plan, agreed in advance so the session that starts it does not have to
rediscover it, is under "The V2 plan" in `session.md`. The load-bearing part is
the first line of it: **Brad writes the code and Claude assists.** If that
quietly slips back to Claude implementing, V2 has no reason to exist.

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

**Do not run the full suites until a commit is actually being made.** This is a
rule, not a preference — Brad has had to say it four times now. `npm test`,
`npm run test:webkit` and `npm run test:all` are for the moment the work is
being committed and for nothing else. Not "before calling a milestone done",
not to confirm a feature works, not after finishing a batch of edits, not
because the change happened to touch gestures or layout — that last one is
its own trap, addressed directly in the WebKit section below, because it is
the one that actually caused the repeat.

"Committed" means Brad has said so — "commit", "commit and push", or
equivalent — in this conversation, for this change. It does not mean "the
feature looks done" or "I would call this a good stopping point." Inferring
commit-readiness from task completion is the exact failure this rule exists
to rule out; if that inference were good enough, the rule would not need to
exist. When work feels finished, say so and ask, or wait — do not run the
suite to check.

During a piece of work: `npm run test:unit`, which is instant, plus the single
smoke spec covering what changed. That is the whole loop. The suites take
minutes each and Brad can check the same thing on his phone faster than
Playwright can join a world.

```bash
npm test           # unit + Chromium smoke tests; ~2 minutes
npm run test:unit  # mappers only — no Foundry, no browser, instant
npm run test:webkit # the same smoke tests under WebKit
npm run test:all   # everything, both engines; ~6 minutes
```

WebKit is deliberately not in the default run. It roughly doubles the time, and
a dev loop that takes six minutes stops being run. This describes which suite
to reach for **once commit time has actually arrived** — it is not a second
permission to run early. Read "any time the change is to layout, gestures,
input handling or anything touching a Foundry dialog" as: at commit time,
don't let a change like that slide through on Chromium alone the way an
unrelated one-line fix might. It does not mean "run WebKit now because this
change happens to be a gesture" — that reading has caused the rule above to be
broken more than once, by treating "this touched gestures" as its own trigger
independent of whether Brad asked for a commit.

### Running the suite from a Mac

Playwright's WebKit on this server is the **Ubuntu build**, and it lays text out
through FreeType and fontconfig. iOS lays text out through CoreText — and so
does Playwright's *macOS* WebKit build. That difference is not academic: the tab
bar's "Features" label measured 43px on Linux and ran off the edge of a real
iPhone, and neither engine here could see it.

So the cheapest real improvement in coverage is to run the suite we already have
on a Mac. Nothing needs moving: `playwright.config.mjs` reads
`PHONEDRY_FOUNDRY_URL`, so a checkout on the laptop can drive the Foundry
container on this server over Tailscale.

```bash
PHONEDRY_FOUNDRY_URL=http://<server>:30000 npm run test:webkit
```

Docker, the world, the bind-mount and the repo all stay where they are. It needs
a checkout and `npx playwright install webkit`, and nothing else.

What each rung above that actually buys, since it is easy to reach for the
heaviest tool first:

- **Playwright WebKit on macOS** catches font metrics and anything laid out from
  text, because it shares CoreText with iOS. Free — same suite, same commands.
- **Real Safari**, driven by `safaridriver` through WebDriver, is the only thing
  that reproduces the dialog collapse: that was established on macOS Safari and
  Playwright's WebKit does not show it on any platform. Costs a second suite in
  Selenium rather than Playwright.
- **The iOS Simulator**, driven by Appium's XCUITest driver, runs real Mobile
  Safari — the touch callout, safe-area insets, iOS chrome. Xcode and macOS
  only; there is no iOS emulator for Linux and no third-party equivalent.
- **A real iPhone** remains the only thing that shows the memory ceiling, which
  is the constraint the whole module exists to respect. No simulator reproduces
  it, because it has the host's memory.

Two classes of fault have now escaped every engine available here — the WebKit
dialog collapse and the CoreText width difference — so treat a green run on this
server as evidence about logic, and a device as the evidence about layout.

Also worth remembering: a smoke test running a whole suite can break on a change
that has nothing to do with it. Adding a tab broke an assertion pinning the
exact contents of the tab bar. That is the test doing its job, not a
regression — but it is a reason the full run belongs at commit time, where
there is a moment to read what it says.

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

Things that have caught out the smoke tests before:

- **A spell posts no chat card until dnd5e's usage dialog is confirmed.** Any
  test asserting on a spell's card has to click `[data-action="use"]` in
  `dialog.application.activity-usage` first.
- **The description panel covers the screen.** A long press aimed at a row
  underneath lands on the backdrop instead, and reads whatever was already
  open. Close it between holds.
- **Headings are uppercased by the stylesheet, not the data.** Compare them
  case-insensitively.
- **Asset 404s are world data, not module faults.** `collectErrors` ignores
  them deliberately: actors routinely point at artwork that is not installed,
  and the module's answer is the silhouette fallback rather than a passing
  console.
- **Never run two suites at once.** They share one Foundry instance, and the
  contention makes unrelated tests crawl from eight seconds to over a minute
  and time out on the join page. Check nothing is already running first.

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
