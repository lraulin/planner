# References for Task Chooser

## Similar implementations to borrow from

### Tasks tab — the closest sibling

- **Location:** `src/components/tabs/TasksGrid.tsx`
- **Relevance:** The Task Chooser is the same shape — a cross-project list of tasks with a
  View dropdown, a scope control, toggles, Show Fields, and the shared `DataGrid`. Its
  column set (State / Pri / Name / Effort / Left / Deadline / % / Status) is nearly the
  chooser's, minus `#` and Score.
- **Key patterns:** `buildColumns()` returning `ColumnDef<OutlineColumnCtx>[]`; a `ViewId`
  union with a `VIEWS` label array driving `ToolbarSelect`; `useGridColumns(\`tasks:${view}\`, …)`
  keying persisted layout **per view**, which the chooser copies verbatim.

### Shared grid-tab behaviour

- **Location:** `src/components/tabs/useGridTab.ts`
- **Relevance:** Selection, drawer, rename, optimistic cell writes, row context menu, and
  the Enter / F2 keyboard handlers — everything the chooser needs that isn't scoring.
- **Key patterns:** `cellHandlers` is the column ctx; extend it with the chooser's score map
  rather than replacing it. `rowMenu` is deliberately short on view-onto-the-tree tabs (open
  - rename only) — the chooser is one of those.

### Tree slicing and derived values

- **Location:** `src/lib/tree/slice.ts`, `src/lib/tree/derive.ts`
- **Relevance:** `derive()` already computes `lapLetter` / `lapRank` (inherited priority),
  effort rollups, and `hasChildren` — `hasChildren` is how "leaf task" is decided, and
  L.A.P. is the score's priority term. `sliceTree`'s `contextFor()` shows the ancestor-walk
  idiom the breadcrumb and `effectiveDeadline` both need.
- **Key patterns:** pure, no I/O, `byId` map passed in — the chooser's scoring module should
  read the same way.

### Derived schedule status

- **Location:** `src/lib/tree/status.ts`
- **Relevance:** Already bands a deadline against `today`, and establishes the convention
  the chooser follows: `today` is a `YYYY-MM-DD` **string** passed in by the caller, never
  `new Date()` inside the module, so the logic is directly testable and server/client
  renders agree.
- **Key patterns:** `daysBetween()` parsing both dates as UTC midnight so daylight saving
  cannot shift a boundary. The chooser's deadline bonus needs exactly this.

### Per-tab persisted preferences

- **Location:** `src/components/grid/useGridColumns.ts`
- **Relevance:** The model for `useChooserSettings` — `localStorage` behind
  `useSyncExternalStore` so the server render and first paint agree on the defaults and the
  client adopts stored values without an effect (no hydration flash).
- **Key patterns:** namespaced key (`planner.grid.columns.{tabId}`), `try`/`catch` around
  both read and write, malformed values falling back to the default, and a `reset()`.

### Configuration modal

- **Location:** `src/components/grid/ShowFieldsDialog.tsx`, `src/components/detail/ModalShell.tsx`
- **Relevance:** The Settings dialog is the same class of thing — a short-lived
  configuration step, the one modal case `ux-principles` allows.
- **Key patterns:** `useId()` → `labelledBy` → `id` on the `<h2>`; padding supplied by the
  dialog, not the shell; a Reset button beside Close.

## Prior specs

| Spec                                                               | Why it matters here                                                                                                                                                                                                                              |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `agent-os/specs/2026-07-28-1121-main-grid-tabs` (frozen)           | Established `DataGrid`, `ColumnDef`, `sliceTree`, `scheduleStatus`, Show Fields, and the four list tabs. The chooser is a fifth tab on that machinery, and inherits its out-of-scope calls (no Views/Filters sidebar, no custom filter builder). |
| `agent-os/specs/2026-07-27-1100-scaffold-and-outline-tab` (frozen) | `derive()`, L.A.P., sort keys, and the row/keyboard idiom.                                                                                                                                                                                       |
| `agent-os/specs/2026-07-30-1018-inbox-quick-capture` (frozen)      | Relaxed the hierarchy so anything may sit at top level and a child may be the same rank as its parent. The chooser's candidate rule cannot assume a task has a project ancestor.                                                                 |

## Source material

| What                                | Where                                                                                                                               |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Achieve Task Chooser screenshot     | `visuals/task-chooser.png` (copy of `screenshots/TaskChooserSS.png`)                                                                |
| Manual — Task Chooser               | `docs/APUserManual.md` §8 (§8.1 window, §8.1.1 views, §8.1.2 Show More/Less, §8.1.3 date filters, §8.2 settings, §8.3 next actions) |
| Manual — Focus field                | `docs/APUserManual.md` §3.10 — "primarily affects the positioning of the project/task in the Task Chooser"                          |
| Manual — next-action definitions    | `docs/APUserManual.md` §2.6.4 (advanced/predecessor — not available to us)                                                          |
| Manual — next-action reminder tasks | `docs/APUserManual.md` §7.2.5 — zero-effort tasks; they stay in the list (visible in the screenshot, row 7)                         |
