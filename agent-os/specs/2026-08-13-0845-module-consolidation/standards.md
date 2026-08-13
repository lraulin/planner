# Standards that apply

**Status: active**

## `components/navigation.md`

The standard this spec **amends**, for the third time. `navigation-and-command-surface` wrote
the module tier, `module-pages` added the page tier, and this one moves nine destinations
between them and deletes the grouping above.

- **"Modules live in one registry… never hard-code a module anywhere else."** Unchanged as a
  rule, and this spec finally makes the bottom bar obey it — `MobileNav` hard-coded
  `/chooser`, `/tasks` and `/notes` while the standard listed it as one of the five surfaces
  reading the registry. `PRIMARY_DESTINATIONS` is what the standard already assumed existed.
- **"Sections, and reserved modules."** The sections half is **superseded**. The reserved
  half is untouched and load-bearing: Focus Timer, Time Log and Reports keep
  `status: "reserved"`, still render nowhere, and still are not drawn as disabled rows —
  _"a menu full of dead rows teaches the reader to stop reading the menu."_
- **The three-word table is factually wrong after this spec.** It offers **Tasks** as the
  example of a module. Tasks is a page now. Fixing the example is not cosmetic: the table is
  the definition, and a definition whose example contradicts the code is how the four-way
  switcher inconsistency got written in the first place.
- **"Pages live in one registry too… everything the module registry promises, the page
  registry promises."** The whole basis of the spec. Nine destinations move tiers and gain
  nothing and lose nothing, because both tiers already promise the same things.
- **"The bar gets its own row, and only when it earns one."** Plan earns seven tabs, Library
  two, Schedule five. Finances still has one built page and still renders no bar.
- **"A page is a URL."** Every collapsed destination keeps a real route, and the ten old
  paths redirect **with their query strings**, because `hrefWithViewState` writes `?detail=`
  and `?view=` onto exactly these paths.
- **"A focused flow is not a page."** The rule that decides the shape of the Time Charts
  move: the list becomes `/schedule/time-charts`, the editor stays at the undeclared
  `/schedule/time-chart/[chartId]` so the subtree rule cannot claim it.
- **"The palette must be complete."** Satisfied for free — `useGlobalCommands` already
  generates `Module: Page` entries from the registry.
- **"Shell state is a setting, not a `localStorage` flag."** `shell.lastPage` gains `plan` and
  `library` keys and loses the ones for the collapsed modules. No migration is owed:
  `builtPageById` already drops a stored id this build does not build, which is the case that
  section reserved the behaviour for.

**Amended by this spec:** sections removed; the module/page examples corrected; a new rule
that the phone's primary destinations are a registry list and may name a page; and the
time-chart singular/plural pair recorded as the worked example of the focused-flow rule.

## `components/responsive.md`

- **The page bar is the row that survives below `md`.** Plan's seven tabs land on the phone
  in the row that already scrolls sideways with 44px targets — built for this in
  `module-pages`, exercised for the first time here.
- **The bottom bar keeps three slots plus More.** The Tasks slot changes where it points, not
  how big it is or how many there are.
- **The More sheet loses its grouping** along with the sidebar, so the two still render the
  app identically — which is the property the shared `sectionsWithModules()` existed to
  guarantee and which a flat list guarantees more simply.

## `components/ux-principles.md`

- **Consistency — the same patterns across every view.** The spec's subject, one tier up from
  `module-pages`: it is not enough for every module to answer "where else can I go in here"
  the same way if the modules themselves are sorted by three different principles.
- **Every destination has a visible tappable path.** Nine destinations move behind a page bar
  rather than a sidebar row; none moves behind a keystroke.

## `development/clean-code.md`

- **One shared implementation per concern.** `withQuery` moves out of `moduleEntry.ts` into
  `src/lib/navigation/`, because ten legacy redirects plus the module entry is eleven places
  that must agree about how a repeated query parameter is re-encoded.
- **`lib` never imports `app`; `components` never touch the db.** Preserved: the page
  registry stays React-free in `src/lib` (which is what keeps it testable), and the icons
  stay in `components/shell`.
- **No speculative generality.** The icons no surface renders after the collapse are deleted
  rather than kept "in case". They are ten lines of SVG each and git has them.

## `development/testing.md`

- **Pure logic in `src/lib`, tested.** The registry resolvers are the tricky part and are
  where a wrong answer looks plausible — `pageForPathname` already has a test file, and
  `primaryDestinations()` gets one.
- **Two existing test files assert things this spec makes false.** `pages.test.ts` uses
  `tasks` as a module id and `/tasks` as a path in no module; `callback-url.test.ts` expects
  `/outline`. Both would keep passing while asserting nothing — the exact failure mode the
  standard calls a test that restates the implementation.
- **No component tests.** Nothing here is a candidate.
- **No integration test is owed.** No mutation, query or `userId` path is touched.
- **A green gate is not proof the app runs.** This spec adds and deletes route files
  wholesale, which is the single highest-risk edit for the gap the standard describes:
  `next build` compiles routes without rendering them. `npm run smoke` against a running dev
  server is the gate that matters here, not the unit suite.
