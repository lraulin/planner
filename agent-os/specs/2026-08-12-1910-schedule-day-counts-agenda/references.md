# References for Schedule Day Counts & Agenda View

## Achieve Planner reference pack

### `docs/achieve-planner/online-help.md:1634-1653` — Weekly Schedule Menu Commands

The canonical control list this work implements:

> **One Day** Display a single day column
> **Three Days** Display three day columns
> **Five Days** Display five day columns
> **Seven Days** Display seven day columns
> **Ten Days** Display ten day columns
> **Twenty Days** Display twenty day columns
> …
> **Work Week Mode** Toggle work-week mode on/off. While in work week mode, Saturdays and
> Sundays are not shown

### `docs/achieve-planner/online-help.md:1461`

> "By default, the 5 day view is displayed, but you can change the number of days displayed
> to one, three, five, seven, ten and twenty using the commands in the View menu"

Planner keeps **7** as the default rather than Achieve's 5, because 7 is what the app has
drawn since the base spec and a default that changes what you already see is a migration.

### Anchoring — what the pack does _not_ say

No passage states how a 3 / 10 / 20-day window is anchored. What exists is width plus
navigation: `online-help.md:1655-1656` ("The Go menu provides additional commands to move
to a particular date and to move to Today") and `online-help.md:3011` ("commands to navigate
to previous or next views"). `release-log.txt:336` later made the **week start day**
configurable, which implies week alignment for the 7-day case. Rolling-from-today is
therefore Planner's decision, not a parity claim.

### No agenda grid in Achieve

`docs/achieve-planner/grid-columns.md:10-69` enumerates every grid tab in the product —
Tasks, Projects, Outline, Goals, Metrics, Notes, Contacts, File Organizer, Resources, Time
Charts, Wish List. There is no Appointments grid. The only textual listing of appointments
is a print report (`docs/achieve-planner/faq.md:201-205`). The agenda view is modelled on
Google Calendar's "Schedule" view instead.

### No "days left" column in Achieve

`grid-columns.md` has no Days Left / Days Remaining field. The deadline-adjacent fields are
`Deadline`, `Deadline Lead Time`, `Lead Time`, `Schedule Status`, `Effort Left`. Achieve's
countdown semantics live in Lead Time, measured in days (`online-help.md:1043-1044`), and in
deadline **scoring** (`online-help.md:1874-1875`) rather than in a column.

## Governing specs

### `agent-os/specs/2026-07-28-1234-weekly-schedule/`

- **Relationship:** Extends; **supersedes** its out-of-scope line "Month/day primary views
  (week is the product surface; mini-month is navigation only)" (`plan.md:192`), narrowly —
  the week stops being the only width, and month/year views stay out of scope.
- **Carries forward:** FullCalendar **Standard v6 (MIT) only, no Premium** (`plan.md:30`,
  `:45-46`) — so `resourceTimeline` is not an option for 20 columns; a `timeGrid` with an
  explicit `visibleRange` is. Recurrence stays expanded in pure code for the visible range,
  never materialized (`plan.md:77-78`).

### `agent-os/specs/2026-08-06-1506-right-click-completion/`

- **Relationship:** Extends.
- **Carries forward:** slot granularity and Work Week Mode became stored settings under a
  new `schedule` scope (change 12) — the day count joins them. Decision 4: the calendar's
  menu is built from `Command`s, so the entries reach `⌘K`, the menu bar and `⋯` as well.

### `agent-os/specs/2026-07-31-1520-persistent-ui-state/`

- **Relationship:** Extends.
- **Carries forward:** Postgres `user_settings(user_id, scope, value jsonb)` is the source
  of truth with a `localStorage` write-through mirror; **URL state is detail drawers and
  sub-view only**, which is why the day count is a setting and only the anchor date is in
  the URL.

### `agent-os/specs/2026-07-31-2046-google-calendar-sync/` (frozen)

- **Relationship:** Touches.
- **Constraint:** the mirror sweep deletes google-origin rows **only inside the synced
  window** (`plan.md:122`, `planMirror` owns the window predicate). Widening or narrowing
  the window with the day count would therefore change what gets reconciled — hence the
  canonical window in this spec.

### `agent-os/specs/2026-07-31-1938-responsive-mobile/` (active)

- **Relationship:** Touches.
- **Constraint:** "Weekly Schedule → `timeGridDay` + a day pager below `md`" and "Phase 6's
  compact Schedule opens on today rather than the week's first day". The `dayOffset`
  mechanism stays; it now indexes into the range rather than into a fixed week.

### `agent-os/specs/2026-07-31-1245-day-tab/` (active)

- **Relationship:** Touches, does not supersede.
- **Constraint:** "Appointments pane is a read-only list, not an hour grid — the Weekly
  Schedule tab owns time-block editing" (`plan.md:124`). The agenda view is on `/schedule`,
  the tab that already owns editing, so that decision is untouched.

### `agent-os/specs/2026-08-04-1530-grid-column-parity/` (frozen)

- **Relationship:** Touches.
- **Constraint:** "Do not change any default column order or visible field" and "add a
  column when Planner has a faithful stored or derived value". Days left is a derived value
  on a **new** grid, so it adds nothing to the existing tabs' defaults.

## Similar implementations

### Non-node `DataGrid` host — the pattern for the agenda

- **Location:** `src/components/notes/NotesGrid.tsx`, `src/components/notes/notesColumns.tsx`
- **Relevance:** `DataGrid<TCtx, TRow>` is generic over the row payload (defaults to
  `OutlineNode`); Notes, Contacts, Finances and Metrics already host it with their own row
  types. The agenda is the same shape.
- **Key patterns:** `ColumnDef<Ctx, Row>[]` as pure data plus render; `useGridState` +
  `GridToolbar` for sort/search/Show Fields; a module-scoped settings key; `DateText` for
  date cells so the display date-format setting applies.

### The calendar itself

- **Location:** `src/components/schedule/WeekCalendar.tsx`,
  `src/components/schedule/ScheduleView.tsx`, `src/components/schedule/MiniMonth.tsx`
- **Relevance:** `WeekCalendar` is a thin FullCalendar wrapper — day columns and slot rows
  are FullCalendar's, so widening the range is a view-config change, not a layout rewrite.
  `ScheduleView` owns the toolbar, the context menu (`SLOT_MINUTES.map(...)` is the exact
  template for `DAY_COUNTS.map(...)`), the optimistic mutations and the compact `dayOffset`.

### Date and range math

- **Location:** `src/lib/schedule/geometry.ts`
- **Relevance:** `startOfWeek`, `weekDays`, `toDateKey` / `fromDateKey` / `localDateKey`,
  `daysBetweenKeys` (reused for Days left), `WEEKDAYS_ONLY`. No date library in this
  codebase, by decision — native `Date` with local midnights.

### Server load and sync window

- **Location:** `src/lib/schedule/queries.ts` (`loadSchedule`),
  `src/lib/schedule/recurrence.ts` (`expandRecurrence`, `expandTimeChartAreas`),
  `src/lib/google/sync.ts` (`syncWindow`, `SYNC_MAX_AGE_MS`),
  `src/lib/google/queries.ts:66` (`syncIsStale` — time-based, records no window)
- **Relevance:** the whole week-shaped seam this work generalizes.

### Settings scope

- **Location:** `src/lib/settings/schedule.ts`, `src/lib/settings/scopes.ts`,
  `src/components/schedule/scheduleSetting.ts`,
  `src/components/settings/SettingsProvider.tsx`
- **Relevance:** `ScheduleViewSettings` with its membership-checked `slotMinutes` parse is
  the idiom the three new keys follow; `loadUserSettings(userId)` is how a server component
  reads the same scope.
