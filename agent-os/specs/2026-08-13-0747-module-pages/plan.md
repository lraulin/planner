# Module pages

**Status: frozen / complete** (2026-08-13)  
Spec folder: `agent-os/specs/2026-08-13-0747-module-pages/`

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-05-0838-navigation-and-command-surface/` — the module
  registry, the "one list, five surfaces" contract, `status: "reserved"`, the `shell` settings
  scope, and the rule that no command is palette-only. This spec adds a **tier below** modules
  and obeys every one of those rules at the new tier.
- **Extends:** `agent-os/specs/2026-08-05-1059-views-across-modules/` — nav destinations are
  **modules**; a **View** is a saved filter / column collection. Neither word changes here; a
  third is added between them.
- **Extends:** `agent-os/specs/2026-08-10-1940-daily-use-performance/` — load only what the
  page needs. Splitting Notes into two routes is how that finally becomes true there.
- **Extends:** `agent-os/specs/2026-07-31-1938-responsive-mobile/` — compact is a different
  IA, not a squashed desktop. The page bar is the one chrome row that survives below `md`.
- **Supersedes:** `agent-os/specs/2026-08-12-2145-notes-journal-presentation/` — its
  **Switching** decisions only: "stay on `/notes`", presentation as a persisted setting rather
  than a route, and the `Grid | Journal` bordered segment. Everything else in that spec (the
  Journal layout, the create-on-type rule, the Journal slot, the date tree, `?date=` as
  location) carries forward unchanged. That spec explicitly deferred this question: _"Lee's
  broader terminology / intra-module subdivision UX is out of scope. This spec only names what
  this switch is."_ This is that work.
- **Supersedes:** `agent-os/specs/2026-08-12-1910-schedule-day-counts-agenda/` — the
  `Calendar | Agenda` switch as a `viewMode` field on `ScheduleViewSettings`. The two
  presentations and everything about `dayCount` / `anchorMode` / `rangeForView` survive; only
  where the choice is stored changes.
- **Supersedes:** `agent-os/specs/2026-07-31-1245-day-tab/` — Day's status as its own module
  and its `/day` + `/day/week` routes. Day becomes two pages of Schedule.
- **Does not supersede:** `agent-os/specs/2026-08-12-2031-finances-insights-dashboard/`
  (active). This spec gives Insights its navigation home as a `reserved` page; that spec flips
  it to `built`.

## Context

The sidebar settled how you get **between** modules. How you get **around inside** one never
settled, and four modules now do it four ways:

| Module           | Sub-navigation today               | Mechanism                          | Control                               |
| ---------------- | ---------------------------------- | ---------------------------------- | ------------------------------------- |
| Fitness          | Sessions \| Exercises              | URL path                           | bordered segment, `bg-surface` active |
| Schedule         | Calendar \| Agenda                 | persisted setting                  | bordered segment, `bg-select` active  |
| Notes            | Grid \| Journal                    | persisted setting                  | bordered segment, `bg-select` active  |
| Day _(reserved)_ | Day \| Week                        | URL path                           | `<Link>` pair, third styling          |
| Finances         | Register (Insights spec active)    | —                                  | none yet                              |
| Time Charts      | list → `/schedule/time-chart/[id]` | URL + hardcoded `returnTo` ternary | "← Back to…" link                     |

Three visual treatments, two persistence models, and `/schedule/plan` reached by a hand-placed
button that is not a registered command. `navigation.md` governs modules and commands and is
silent on the tier between them.

**Outcome:** a **Page** tier between Module and View, one shell-owned bar, one registry. No new
features — this is chrome, plus the relocation of Day.

### The axis that was rejected

The first shaping pass split these by whether the records were the same (Schedule, Notes) or
different (Fitness). Lee pushed back, and was right: Notes Grid→Journal changes _which_ notes
you see and what a selection means, Fitness changes the entity, Schedule changes neither. Three
points on a spectrum, and every future feature would have had to pick a side of a line that is
not there.

The axis that carries weight is **"is this a place you can be?"** — and all of them are. Each
has its own selection, its own scroll position, its own meaning for "what is selected". So: one
concept, one control, no exceptions.

## Decisions

### Terminology

| Word       | Means                                                                           |
| ---------- | ------------------------------------------------------------------------------- |
| **Module** | Sidebar destination — Tasks, Fitness, Schedule                                  |
| **Page**   | A destination _within_ a module — Sessions, Journal, Agenda, Insights ← **new** |
| **View**   | Saved collection of filter / column / sort settings                             |
| **Pane**   | A layout region that collapses below `md` (Day's three panes)                   |

"Page" over "Section" — `SECTIONS` is already the sidebar's Plan/Do/Track/Library grouping and
`MENU_SECTIONS` is command-menu grouping. Over "Tab" — retired, and `tab` still names grid
settings scopes. Over "View" — taken, and taken by Achieve's own word. Page maps 1:1 to a URL
segment and a `page.tsx`, which is the whole design.

**View is not renamed to Lens.** It is Achieve's word, and it is in `data-grid.md`, the UI and
every call site; renaming is churn for a synonym. But "lens" must name exactly one thing: it
stays the internal name for `TabToolbar`'s row 2, and stops being applied to individual controls
(`NotesPresentationSwitch` and `FitnessView` both call one a "lens control" today).

### The rule

> **Underline tabs = navigation (pages). Bordered segments = a setting with 2–3 values.**

Density stays a bordered segment. `Calendar | Agenda`, `Grid | Journal` and
`Sessions | Exercises` all become underline tabs. This is why the four modules stop looking
different — not one control for everything, but **one control per question**, used the same way
everywhere.

### The page bar is its own row

```
┌ Sidebar ──┬────────────────────────────────────────────┐
│ Schedule ◄│  Day   Calendar   Agenda   Week Plan       │ ← page bar
│           │        ────────                            │
│           ├────────────────────────────────────────────┤
│           │  File  Edit  Item  View          [icons]   │ ← command row (verbs)
│           ├────────────────────────────────────────────┤
│           │  View ▾  Search  Filter…  Density          │ ← lens row
```

Its own row rather than a zone of the command row. It is navigation — the same rank as the
sidebar — and folding it in with the verbs is exactly the flattening `TabToolbar`'s two-row
split exists to prevent.

The bar renders **only when a module has ≥2 built pages**, so Tasks, Projects, Goals, Outline,
Chooser, Metrics, Resources and Contacts gain zero pixels. Only the four modules that already
had a switcher pay the ~34px.

### Where every page lands

| Module                                          | Pages                                                                            | Default  |
| ----------------------------------------------- | -------------------------------------------------------------------------------- | -------- |
| **Schedule** _(renamed from "Weekly Schedule")_ | `/schedule/day`, `/schedule/calendar`, `/schedule/agenda`, `/schedule/week-plan` | calendar |
| **Fitness**                                     | `/fitness/sessions`, `/fitness/exercises`                                        | sessions |
| **Notes**                                       | `/notes/grid`, `/notes/journal`                                                  | grid     |
| **Finances**                                    | `/finances/register`, _(insights: reserved)_                                     | register |
| Everything else                                 | none — no bar                                                                    | —        |

**Day folds into Schedule.** `modules.ts` already anticipated it — _"restoring or folding it
into Schedule is a status flip, not a rebuild"_. The `day` module entry is retired, `DayView`
becomes the Day page and `WeekPlanView` the Week Plan page, and `/day` + `/day/week` become
redirects so bookmarks survive. The module is renamed **Schedule**, because "Weekly Schedule"
holding a Day page is a lie.

_This is a relocation, not an endorsement._ Day's future is still open — Task Chooser still
covers the daily-pick job better — and nothing here builds new work on `daily_items`. Folding it
in is what makes an unfinished surface stop reading as a sore thumb while that stays undecided.

**Finances renders no bar yet** — one built page. That is the rule working, not a bug, and it is
recorded here so it does not get "fixed". The active insights spec flips `insights` to `built`
and the bar appears.

**Focused flows are not pages** and never appear in the bar: `/fitness/log`, `/schedule/plan`,
`/schedule/time-chart/[id]`, the editors. The test — in the bar you leave by tapping a sibling; a
focused flow has an exit.

### Registry

Page data is pure (the bar is text-only — no icons), so it lives in `src/lib/navigation/pages.ts`
where it can be unit-tested. `src/components/shell/modules.ts` keeps the modules and their React
icons and exposes the one accessor, `pagesFor(moduleId)`. That split exists only because a
`src/lib` file must not import a component module; without the icons it would be one file.

```ts
type PageEntry = {
  id: string;
  label: string;
  segment: string; // href = `${module.href}/${segment}`
  status: "built" | "reserved";
  default?: true; // exactly one built page per module
  keywords?: string; // palette
};
```

Same rules as modules, one tier down: one registry read by every surface, `reserved` renders
nowhere, and placement belongs to the page rather than to the surface.

### Path resolution is the tricky part

`/fitness/sessions/abc` is the session editor rendered _inside_ `FitnessView`, so the bar renders
with Sessions active. `/schedule/time-chart/abc` is a focused flow under a module that has pages,
and must resolve to **no page** so no bar renders.

So: **longest matching declared segment prefix, or nothing** — not "the first path segment after
the module". A prefix rule that matched anything would put a page bar on the time-chart editor;
a rule that required an exact match would drop it from the session editor. Both are wrong and
neither is visible from the type system, which is why this is the part that gets a test.

### Sticky last page

`/schedule` server-redirects to wherever you left off. Notes and Schedule have this today
through their settings; losing it would be a real regression for anyone who lives in Agenda.

- `lastPage: Record<string, string>` joins `ShellSettings` — the scope `navigation.md` already
  designates for "anything else the shell remembers", and it already loads server-side in
  `src/app/layout.tsx`, so the redirect is decided before the first byte and there is no flash.
- A stored id that is unknown or `reserved` falls back to the default. The parser must not throw:
  it runs before first paint, where an exception breaks the app rather than one grid.
- **The redirect preserves the query string**, so `Schedule block…`'s `/schedule?block=<id>`
  still works. That command targets `/schedule/calendar?block=` explicitly, because blocking out
  time is a calendar act.
- **Page switches preserve the query string too** — `/schedule/calendar?start=2026-08-13` →
  `/schedule/agenda?start=2026-08-13`. Pages already validate their own params (`anchorKeyFrom`),
  so a param a page cannot use is ignored rather than fatal.

### Known smell, named and not resolved here

Three week-shaped things now sit near each other: Calendar at `dayCount 7`, the Week Plan page,
and the `/schedule/plan` wizard. Naming it is in scope; resolving it is not. (The wizard's
natural home is probably an entry point _on_ the Week Plan page.)

## Acceptance criteria

- [x] Every module with ≥2 built pages renders one shell-owned underline bar, and no module has a
      hand-rolled sub-navigation control left.
- [x] No bordered segmented control is used for navigation anywhere; density still is one.
- [x] `pages.ts` is the only list of pages, and the palette's `go.<module>.<page>` entries are
      generated from it rather than written out. Verified in the browser: typing `journal`
      returns `Notes: Journal`, `Notes: Grid` and `Schedule: Day` (the last through Day's
      inherited keywords).
- [x] `/fitness/sessions/abc` shows the bar with Sessions active; `/schedule/time-chart/abc`
      shows no bar. Both covered by `pages.test.ts` (18 tests).
- [x] Reload holds the page; Back walks pages; every page is openable in a new tab.
- [x] `⌘K` reaches every built page by name.
- [x] `/day` and `/day/week` still land somewhere correct, preserving `?date=` / `?week=` —
      smoke prints both bounces.
- [x] Sitting on Agenda, going to Tasks and clicking Schedule lands on Agenda. No flash: the
      redirect is resolved server-side, and `smoke` shows `/schedule → /schedule/agenda` as a
      307 rather than a render.
- [x] Finances renders no page bar.
- [x] Notes' two pages each load only their own data; `/notes` no longer calls both
      `loadNotesListPayload` and `loadDiarySummaries`.
- [x] At 390px the bar's four Schedule tabs fit without scrolling and its targets are 44px.
      **The chrome stack on `/schedule/day` was measured and is a problem — see change 5.**
- [x] `npm run test:unit` (2036 in 173 files), `typecheck`, `lint`, `build` and
      **`npm run smoke`** (34 routes, up from 23) are clean.

## Changes from original plan

Material refinements during implementation (requirements, design, scope). Omit pure code polish.

| #   | Change                      | Why |
| --- | --------------------------- | --- |
|     | _(filled during implement)_ |     |

## Task 1: Save spec documentation

This folder: `plan.md`, `shape.md`, `standards.md`, `references.md`.

## Task 2: Registry and settings

- `src/lib/navigation/pages.ts` + `pages.test.ts` — the `PageEntry` type, the page lists, and
  the resolvers. Tests cover the longest-prefix rule, the focused-flow miss, reserved pages, an
  unknown module, and the bare module path.
- `pagesFor()` on `src/components/shell/modules.ts`.
- `lastPage` in `src/lib/settings/shell.ts` + `shell.test.ts` — unknown / reserved id falls back
  to the default, and an unusable blob returns defaults rather than throwing.

## Task 3: PageBar, shell wiring, standard

- `src/components/shell/PageBar.tsx` — client component reading `usePathname()`, so it cannot
  disagree with the URL and no call site has to pass the active page. Real `<Link>`s: a page is
  a URL and must open in a new tab (`DayHeader` already makes this argument for its date
  stepper). `aria-current="page"`, matching `Sidebar`.
- Rendered by `AppShell` between `MobileHeader` and `children`.
- ~34px, 13px text, active `text-ink` + 2px `bg-select-edge` underline over the row's
  `border-rule`. Below `md`: `overflow-x-auto`, 44px tap height.
- `go.<module>.<page>` entries in `useGlobalCommands`, so the palette stays complete.
- Amend `agent-os/standards/components/navigation.md`: the Page tier, the
  underline-vs-segment rule, the focused-flow exclusion, and the "lens names one thing" note.

## Task 4: Fitness

Reference implementation. `/fitness/sessions` page, `/fitness` → redirect,
`fitnessSessionsPath()` updated, hand-rolled segment deleted from `FitnessView`.

## Task 5: Notes

`/notes/grid` + `/notes/journal`; `NotesModule`'s presentation branch and its `useEffect` flip
become routing. `/notes?note=<diary id>` redirects to `/notes/journal`. Each page loads only its
own data. Retire `NotesPresentationSwitch`; drop `presentation` from `NotesViewSettings`.

## Task 6: Schedule — Calendar | Agenda

`viewMode` moves out of `ScheduleViewSettings` and becomes the route; `ScheduleView` takes it as
a prop. `dayCount` / `anchorMode` / `rangeForView` are untouched — they answer "how much", not
"drawn how".

## Task 7: Fold Day into Schedule

`/schedule/day` (`DayView`) and `/schedule/week-plan` (`WeekPlanView`); `/day` and `/day/week`
redirect, preserving `?date=` / `?week=`. Retire the `day` module entry and `DayIcon`, migrate
`active="day"` call sites, rename the module to **Schedule**, merge `GO_KEYWORDS.day` into
schedule's. `DayHeader`'s Day/Week `<Link>` toggle is deleted; its date stepper stays.

## Task 8: Finances

`/finances/register` + redirect; `insights` registered as `reserved`. No bar renders yet.

## Task 9: Sticky last page

Bare module paths read `lastPage` instead of always taking the default.

Also folded in here, because they are the same inconsistency: `/schedule/plan`'s hand-placed
button becomes a registered command, and `TimeChartEditorView`'s
`returnTo === "/time-charts" ? … : …` becomes the general return.

## Task 10: Verify, freeze spec, update roadmap

Done. Verified in a real browser at desktop and compact, plus the full gate and `npm run smoke`.

## Follow-ups (new work — not amendments to this frozen spec)

- **Day's doubled toolbar.** `/schedule/day` spends 232px of chrome before its first row on a
  phone, 85px of it in two stacked `TabToolbar`s — `DayHeader`'s date stepper and
  `DailyItemsGrid`'s overflow-only bar. Merging them is a `DayView` restructure and belongs with
  whatever decides Day's future, not with a navigation spec.
- **Three week-shaped surfaces.** Calendar at `dayCount 7`, the Week Plan page, and the
  `/schedule/plan` wizard now sit within one bar of each other. Named during shaping,
  deliberately unresolved. The wizard's natural home is probably an entry point _on_ Week Plan.
- **Finances Insights** flips its `reserved` page to `built`, at which point the Finances page
  bar appears for the first time. Owned by
  `agent-os/specs/2026-08-12-2031-finances-insights-dashboard/`.
- **The remaining hand-written row menus**, still outstanding from the navigation spec.
