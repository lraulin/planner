# References for the Day tab

## Related specs

- **`agent-os/specs/2026-07-31-0834-task-recurrence`** (active) — established
  _should be done ASAP ≠ has a deadline_, and the `deferredDate` mechanism that keeps
  routines off the Chooser without pretending to have deadlines. The Day tab applies the same
  rule to day assignments. Its `applyStateTransition` is called directly when a node-backed
  daily row is checked off.
- **`agent-os/specs/2026-07-30-2040-tc-priority`** (frozen) — the flat, hand-maintained
  Franklin Covey ranking on the To-do List. That is Covey's **Master Task List**; this spec
  adds the **Daily** list beside it. Its ranking engine was extracted and is now shared.
- **`agent-os/specs/2026-07-30-1858-task-chooser`** (frozen) — the candidate rule ("leaf tasks
  and task-less projects") that decides what can be planned onto a day, and
  `buildChooserItems`, which builds the week grid's master rail.
- **`agent-os/specs/2026-07-29-1045-notes-markdown-editor`** (frozen) — the `notes` table,
  markdown editor and autosave that the journal reuses wholesale.

## As-built code (primary)

- `src/db/schema.ts` → `dailyItems`; `drizzle/0015_square_beyonder.sql`
- `src/lib/day/` — `types.ts`, `queries.ts`, `mutations.ts`, `forward.ts`, `priority.ts`
- `src/lib/priority/letterRank.ts` — ranking rules shared with the chooser
- `src/app/day/page.tsx`, `src/app/day/week/page.tsx`, `src/app/day/actions.ts`
- `src/components/day/` — `DayView`, `DayHeader`, `DailyItemsGrid`, `dayColumns.tsx`,
  `AppointmentsPane`, `DailyNotesPane`, `WeekPlanView`
- `src/components/grid/LetterRankCell.tsx`
- `src/components/detail/PlanForDayField.tsx`

## Patterns borrowed (pre-existing)

### Row drag-and-drop

- **Location:** `src/components/grid/DataGrid.tsx` (`RowDrag`), consumed the same way as
  `src/components/chooser/ChooserGrid.tsx:196`
- **Relevance:** `DailyItemsGrid` supplies daily-ranking semantics; the grid learns nothing
  new. The week grid's column drops use native HTML5 `dataTransfer` directly, consistent with
  `DataGrid` — deliberately **not** dnd-kit or react-dnd, neither of which this repo uses, and
  not FullCalendar's `Draggable`, which is for calendar drops only.

### Fractional sibling ordering

- **Location:** `src/lib/tree/sortKey.ts` (`between`)
- **Relevance:** daily rows order the same way nodes and notes do, so inserting never
  renumbers the rows above.

### Optimistic write then `router.refresh()`

- **Location:** `src/components/schedule/ScheduleView.tsx`,
  `src/components/planning/WeeklyPlanView.tsx`
- **Relevance:** `DayView` follows it, including the compare-props re-sync idiom (re-seed
  state during render when the server sends a new payload, not in an effect).

### Server actions

- **Location:** `src/app/notes/actions.ts` — the `run()` wrapper
- **Relevance:** `src/app/day/actions.ts` is the same shape. Actions never throw; a rejected
  save renders inline via `ErrorBanner`.

### Integration-test harness

- **Location:** `src/lib/notes/mutations.integration.test.ts`, `src/lib/testing/database.ts`
- **Relevance:** one fresh user per test, loud skip when Postgres is down, and the cross-user
  block that is the hard gate in `agent-os/standards/development/testing.md`.

## Visuals

Franklin Covey PlanPlus, supplied by Lee:

- `screenshots/PlanPlus/DailyView.jpg` — the three-pane day page (Daily Tasks | appointments |
  Daily Notes), the Daily Tasks / Master Tasks pane toggle, and the status-mark context menu:
  None, Completed, Forwarded, Completed and Forwarded, Deleted, Delegated, In Process.
- `screenshots/PlanPlus/Franklin_Covey_software_weekly_planning.jpg` — Master Tasks with an
  A1/A2 column on the left, seven day columns on the right, each with its own ABC column.
- `screenshots/PlanPlus/FC Paper Planner Daily.jpg` — the paper page this all descends from:
  Appointments | Task List (✓ + abc + text) | Notes.

For contrast, Achieve's own weekly planning:
`screenshots/WeeklyPlanningWizardDropBlocks.png` — project blocks dropped on a time grid, one
project at a time. A different altitude, and untouched by this spec.

## External

- Achieve Planner user manual: `docs/achieve-planner/user-manual.md` §8 (Task Chooser — the candidate rule
  and the To-do List view), §4 (priorities).
