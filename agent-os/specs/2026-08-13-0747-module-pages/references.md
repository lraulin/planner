# References

**Status: active**

## Governing specs

### `agent-os/specs/2026-08-05-0838-navigation-and-command-surface/`

- **Relationship:** Extends.
- **Relevant decisions:** The module registry and the "one list, five surfaces that must not
  drift" contract; `status: "reserved"` and the ban on rendering dead rows; the `shell` settings
  scope and the no-flash argument for loading it in `layout.tsx`; "no command is palette-only".
  This spec adds a tier below modules and inherits all four.
- **Also worth re-reading:** its **Changes from original plan** row 5 — keyword matching had to
  become word-prefix because subsequence matching made the palette answer questions nobody
  asked. The new per-page palette entries go through the same matcher and must not reintroduce
  it.

### `agent-os/specs/2026-08-12-2145-notes-journal-presentation/`

- **Relationship:** Supersedes its **Switching** decisions only.
- **Carries forward:** the Journal layout (mini-month, real date tree, write pane), the
  create-on-type rule, the Journal slot as one `notes` row per day, `?date=` as location,
  `?note=` deep links, and the Rednotebook archive.
- **Replaced:** "stay on `/notes`", presentation as a persisted setting, and the `Grid | Journal`
  bordered segment. Its own words invited this: _"Lee's broader terminology / intra-module
  subdivision UX is out of scope. This spec only names what this switch is."_

### `agent-os/specs/2026-08-12-1910-schedule-day-counts-agenda/`

- **Relationship:** Supersedes the storage of `viewMode` only.
- **Carries forward:** both presentations, `dayCount`, `anchorMode`, `rangeForView`, and the
  `?start=` anchor. Only where the Calendar/Agenda choice lives changes.

### `agent-os/specs/2026-07-31-1245-day-tab/`

- **Relationship:** Supersedes Day's status as a module and its `/day` + `/day/week` routes.
- **Relevant:** what Day actually is, so the fold does not quietly drop half of it — `DayView`
  is appointments + daily items + journal in three panes, and `WeekPlanView` is a separate
  week-planning surface with a chooser rail. Two pages, not one.

### `agent-os/specs/2026-08-12-2031-finances-insights-dashboard/` (active)

- **Relationship:** Neither extends nor supersedes; **coordinate**. This spec reserves
  `/finances/insights`; that spec builds it and flips `status` to `"built"`, at which point the
  Finances page bar appears for the first time.

### `agent-os/specs/2026-08-10-1940-daily-use-performance/`

- **Relationship:** Extends.
- **Relevant:** "load only what the page needs." `src/app/notes/page.tsx` currently calls both
  `loadNotesListPayload` **and** `loadDiarySummaries` on every visit, because presentation is
  decided client-side. Splitting into two routes is what finally makes that spec's rule true in
  Notes.

## In this codebase

### The registry to copy, one tier up

- **Location:** `src/components/shell/modules.ts`
- **Relevance:** The shape, the vocabulary and the doc-comment standard the page registry should
  match. Its header already explains why `View` and `module` mean what they mean, and its `day`
  entry already contains the decision this spec executes: _"Keep the entry (and `/day` +
  `/day/week`) so restoring or folding it into Schedule is a status flip, not a rebuild."_
- **Key patterns:** `as const satisfies readonly ModuleEntry[]` for literal ids with a checked
  shape; `BUILT_MODULES` filtering `reserved` out once so no consumer forgets; a
  `sectionsWithModules()`-style accessor rather than consumers filtering for themselves.

### The active-item styling vocabulary

- **Location:** `src/components/shell/Sidebar.tsx`
- **Relevance:** How an active navigation item looks and announces itself here —
  `aria-current="page"`, `bg-select font-medium text-ink` active against
  `text-ink-muted hover:bg-surface-raised hover:text-ink` idle. The page bar uses an underline
  rather than a fill, but the token choices and the `aria-current` convention come from here.

### The two-row toolbar the bar sits above

- **Location:** `src/components/tabs/tabChrome.tsx` (`TabToolbar`)
- **Relevance:** Its header comment is the precedent for "its own row": one row held both verbs
  and lens controls and produced _"a flat run of identically-bordered controls where `New` and
  `Rename` sat between `Group by` and `Density` with nothing to say which was which."_ The page
  bar is the same argument one tier up. Note also that row 1 is desktop-only, which is why the
  page bar (not the command row) is what must survive below `md`.

### The three hand-rolled switchers being replaced

- **Locations:** `src/components/fitness/FitnessView.tsx` (~line 271),
  `src/components/schedule/ScheduleView.tsx` (~line 870),
  `src/components/notes/NotesPresentationSwitch.tsx`, `src/components/day/DayHeader.tsx` (~line 95)
- **Relevance:** The inventory. Two share a treatment (`bg-select`, `overflow-hidden rounded
border`), Fitness has its own (`gap-1 p-0.5`, `bg-surface`), Day uses bare `<Link>`s. All four
  come out.
- **Keep from `DayHeader`:** its comment justifying links over buttons — _"a day is a URL, so
  these must be openable in a new tab"_ — which is exactly why the page bar uses `<Link>`.

### The pane switch that must stay distinct

- **Location:** `src/components/day/DayView.tsx` (`PaneSwitch`, ~line 355)
- **Relevance:** Looks like the others and is not one of them. It is a responsive layout device —
  three desktop panes shown one at a time below `md` — and it stays. Its comment documents the
  hydration trap the page bar must also avoid: `useIsCompact()`'s server snapshot is `false`, so
  a JS branch on width renders the desktop shape and visibly swaps.
- **Watch:** on `/schedule/day` at 390px this now stacks under the page bar. Measured in Task 10.

### The palette generator to extend

- **Location:** `src/components/shell/globalCommands.ts`
- **Relevance:** `useGlobalCommands` already generates `go.<module>` from `BUILT_MODULES` so that
  _"a new module becomes reachable by `⌘K` the moment it is added"_. Pages need the same
  treatment, and `GO_KEYWORDS` is where Achieve's own vocabulary lives — `day: "today daily page
franklin covey"` has to survive the fold into Schedule rather than being deleted with the
  module entry.

### The settings codec to extend

- **Location:** `src/lib/settings/shell.ts` (+ `scopes.ts`, `session.ts`)
- **Relevance:** Where `lastPage` goes, and the existing `commandsPanelCollapsed: Record<string,
boolean>` is the precedent for a keyed map in this scope — including its comment on why an
  unknown key must be tolerated rather than treated as corruption: _"a section that stops
  existing leaves a dead key rather than a broken panel."_ A stored page id that no longer exists
  needs exactly that behaviour.

### The route-shape helpers

- **Location:** `src/lib/fitness/routes.ts`
- **Relevance:** The one module that already centralises its paths, and the model for how the
  others should stop hand-writing template strings. Note `/schedule/plan` is pushed as a literal
  from three separate places (`ScheduleView`, `globalCommands`, `OverviewView`).

### The smoke harness

- **Location:** `scripts/smoke.mjs`
- **Relevance:** Discovers routes from the filesystem rather than a hand-kept list, skips dynamic
  segments, and treats a 302/307 as a pass while printing the destination. So every new page and
  every `/day` → `/schedule/day` redirect is covered without editing the script — but the route
  count moves off 23, and a redirect that lands on `/login` is reported as a setup failure rather
  than a broken page.
