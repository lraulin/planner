# Grid Control Surface

**Status: frozen / complete (2026-08-04)**  
Spec folder: `agent-os/specs/2026-08-04-0924-grid-control-surface/`

Durable rules extracted to `agent-os/standards/components/data-grid.md`. Future work in this
area opens a new delta spec rather than editing this folder.

## Context

Every grid in the app — Outline, Projects, Tasks, Goals, Wish List, Notes, Chooser, Day —
already renders through one `DataGrid` + `useGridState` + `ShowFieldsDialog`. The row layer
is shared. What is _not_ shared is the **control surface**: each tab hand-assembles eight
toolbar buttons, and its distinguishing switches (`groups`, `includeGoals`, `groupByArea`,
`showPurpose`) sit in plain `useState`, so unlike everything in `useGridState` they are lost
on reload. Adding a capability to one grid means coding it into that grid.

Three concrete gaps, plus one bug:

- **Filtering cannot reach hidden columns.** `DataGrid.tsx:301-305` builds filter values
  only from the _visible_ `columns`, but `rowPassesFilters` (`filters.ts:274`) iterates
  every stored filter. Hide a column that has an active filter and each row is tested
  against `null`, so nothing matches — the grid empties with no funnel on screen to explain
  it. This is a live bug, not only a missing feature.
- **Grouping is hardcoded per tab.** `sliceTree`'s `GroupBy` union is `category |
resultArea | goal`, and each tab pins its own array (`ProjectsGrid.tsx:285`). The user
  cannot group by anything else.
- **No quick search, no filter chips, no result count, no density, single-column sort only.**

### The library question, settled

`2026-07-28-1121-main-grid-tabs` rejected TanStack Table because it supplies the easy half.
Re-checked against the current code, that holds and has hardened:

- TanStack uses `subRows` for **both** tree data (`getSubRows`) and grouping
  (`getGroupedRowModel`), so the two are mutually exclusive. Every grid here needs
  hierarchy _and_ group headers at the same time.
- Its sort/filter/visibility state is in-memory; ours already persists to Postgres
  `user_settings` via `useSetting`. We would write an adapter to get back to where we are.
- Hierarchy-preserving sort (`src/lib/grid/sortRows.ts`, 149 lines, tested) and tree
  drag-drop (`useTreeRowDrag`, `lib/tree/dnd`) are the two features we would be migrating
  _for_, and both already work.

**Decision: keep the hand-rolled grid.** Spend the effort on the control surface instead.
AG Grid and MUI X stay rejected on licensing (tree data + row grouping are Pro/Premium).

### Outcome

A tab declares _what it has_ (columns, switches, group dimensions); the shared grid supplies
_how you control it_. Adding filtering-by-hidden-column, group-by, search, density or
multi-sort to a new grid becomes zero code in that grid.

## Decisions

| Decision        | Choice                                                                                                                                                                                  |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Library         | Hand-rolled, as above. No new runtime dependency.                                                                                                                                       |
| Advanced filter | **Cross-column builder panel** over every column the tab defines, visible or not. Reuses the operators in `src/lib/grid/customFilter.ts`. Per-column funnels stay for quick refinement. |
| Filter feedback | Active conditions render as removable chips above the grid with `Showing 47 of 312` and `Clear all`.                                                                                    |
| Saved views     | **Built-in presets + persisted switches only.** No `grid_views` table this slice. Tweaks to a preset persist per view, as column layout already does.                                   |
| Sort            | Multi-column via Shift-click, numbered indicators, still sibling-only within groups.                                                                                                    |
| Density         | Comfortable / compact, per grid, by overriding `--row-height` on the grid container.                                                                                                    |
| Persistence     | Everything lands in the existing `grid:{tabId}` scope through the single `patch` in `useGridState` — see that file's header comment on why one hook owns the whole scope.               |
| Virtualization  | **Out of scope.** Personal data volumes; the row layer is CSS grid + drag and would fight a virtualizer. Revisit only if a grid actually gets slow.                                     |

## Acceptance criteria

All verified in the running app on 2026-08-04 (see **Verification** for the steps).

- [x] A filter on a hidden column narrows rows correctly and appears as a chip; hiding a
      filtered column no longer empties the grid. _(Projects → hidden `Purpose` "is not
      blank" → `Showing 1 of 47`, chip present.)_
- [x] `Filter…` opens a cross-column builder: Match All/Any, per-row column + operator +
      operand, hidden columns marked as such, add/remove rows, Clear all.
- [x] Chip bar above the grid shows every active condition (per-column and cross-column),
      each removable, with `Showing N of M` and `Clear all`.
- [x] Quick search box filters across all filterable columns, debounced, persisted.
      _(`task` → `Showing 2 of 9`, chip `Search "task"`.)_
- [x] Group by picker offers Category / Result Area / Goal / Project / State / Priority
      letter / Deadline band / none, with counts, sticky headers, Expand all / Collapse all.
      _(Tasks → Deadline → `Overdue (1)`, `(No Deadline) (8)`; Collapse all → 2 rows;
      Expand all → 11.)_
- [x] Shift-click a second header adds a secondary sort with a numbered indicator; sorting
      never lifts a child above its parent or moves a group header. _(`Pri↑1`, `Deadline↑2`;
      subtrees stayed nested.)_
- [x] Density toggle changes row height for that grid and survives reload.
- [x] Projects/Tasks switches (`Groups`, `Goals`, `Postponed`, `Group by Area`, `Purpose`)
      survive a reload.
- [x] Every grid tab's toolbar is assembled by the shared `GridToolbar`, not hand-built.
      _(Remaining `TabToolbar` users — Metrics, Day header, Fitness — are not `DataGrid`
      tabs.)_
- [x] `agent-os/standards/components/data-grid.md` exists and is listed in `index.yml`.

Also verified as regressions-not-introduced: drag-to-reorder still moves a row and persists
(Outline), and all 1089 unit tests, `typecheck` and `lint` pass.

## Changes from original plan

| #   | Change                                                                                                      | Why                                                                                                                                                                                                                             |
| --- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `CrossColumnFilter` lives in a new `src/lib/grid/crossFilter.ts`, not in `customFilter.ts` as the plan said | Keeps `customFilter.ts` about expressions _within_ one column. `crossFilter.ts` imports the operator vocabulary rather than forking it.                                                                                         |
| 2   | Added `src/lib/grid/chips.ts` and `src/lib/grid/distinct.ts`, neither in the plan                           | The chip **wording** is the feature and needed to be testable outside React. Distinct values had to be derived once and shared, or the header funnel and the advanced builder could offer different values for the same column. |
| 3   | **Group headers now restate their count after filtering**                                                   | Not in the plan; found on screen. Counts came from the unfiltered slice, so a header read `Career (7)` above one visible row. A count beside a filtered list has to be the count of that list.                                  |
| 4   | Group headers are sticky on **desktop** too, and nested levels stack by depth                               | The plan only noted compact was already sticky. Scrolling forty rows of a group without seeing which group you are in is the failure grouping exists to prevent.                                                                |
| 5   | Group by is **one level** from the toolbar, though the model nests arbitrarily                              | `sliceTree` already nests; a second select is UI nobody has asked for yet. Tabs that want a fixed two-level default (Projects' Category → Result Area) keep it as their `Groups` switch, which the picker overrides.            |
| 6   | Sort keys resolve against **visible** columns, unlike filter and search                                     | A filter on a hidden column is legible from its chip; a sort on one is a grid that has silently rearranged itself with no indicator to explain it.                                                                              |
| 7   | Outline: view toggles moved out of `FilterBar` into `GridToolbar`; `FilterBar` kept as a pure command bar   | `FilterBar` mixes _commands_ (add, indent, delete) with _view state_ (type filters). Splitting them gave the outline the shared controls without a third toolbar row.                                                           |
| 8   | Notes: its domain filter renamed **Note filter…**                                                           | The shared toolbar now has a `Filter…` of its own over columns. Two identically-labelled buttons narrowing the same list by different rules is not something anyone works out twice.                                            |
| 9   | Notes keyboard guard switched to the existing `isModalOpen()`                                               | Show Fields and Filter now live inside `GridToolbar`, so the tab cannot see them; a per-dialog flag list would silently miss any dialog added later.                                                                            |
| 10  | `DailyItemsGrid` (Day tab) did **not** get a `GridToolbar`                                                  | It is a pane inside the Day page, not a tab. A full control bar over a narrow pane is a regression. It still inherits every `DataGrid` fix — hidden-column filtering, multi-sort, corrected group counts.                       |
| 11  | Added `hasAnyNarrowing` beside `hasActiveFilters`                                                           | A grid narrowed only by the search box would otherwise show a disabled Clear button next to rows the user cannot account for.                                                                                                   |
| 12  | `MAX_SORT_KEYS = 3`                                                                                         | A fourth tiebreak has never decided anything visible, and numbered indicators stop reading as ranks past three.                                                                                                                 |

---

## Task 1: Save spec documentation

Create `agent-os/specs/2026-08-04-0924-grid-control-surface/` with `plan.md` (this file,
**Status: active**), `shape.md`, `standards.md` (`components/ux-principles`,
`components/responsive`, `components/modal-pattern`, `development/testing`),
`references.md`, and `visuals/` holding the filter-panel sketch from shaping.

`references.md` must cite `2026-07-28-1121-main-grid-tabs` (original library rejection),
`2026-07-31-1520-persistent-ui-state` (the settings scope this extends), and
`2026-08-02-1208-custom-column-filters` (the operator vocabulary being reused — **note it is
still marked active and is frozen by Task 10**).

## Task 2: Evaluate filters against all defined columns

Foundation for everything else, and the bug fix.

- `DataGrid` gains an `allColumns?: ColumnDef[]` prop, defaulting to `columns`. Build
  `values`, `kinds` and `distinctValues` from `allColumns`; keep rendering from `columns`.
- Each tab passes the full `allColumns` array it already builds for `ShowFieldsDialog`
  (e.g. `ProjectsGrid.tsx:265`).
- A filter whose column id is absent from `allColumns` is ignored rather than failing every
  row — a layout saved before a column was renamed should degrade, matching the existing
  `order` handling in `useGridState.ts:127`.
- Test in `src/components/grid/filters.test.ts`: an active filter on a column not in the
  visible set still selects the right rows; an unknown column id is inert.

## Task 3: Extend the persisted grid settings

In `src/lib/settings/grid.ts`, add to `GridSettings`:

- `sorts: GridSort[]` replacing `sort: GridSort | null` (keep `parseGridSettings` accepting
  the legacy single object and wrapping it in an array — old blobs must keep working, same
  contract as `parseColumnFilter`'s legacy `string[]`).
- `search: string`
- `groupBy: string[]` (group dimension ids, outer first; `[]` = ungrouped)
- `density: "comfortable" | "compact"`
- `advancedFilter: CrossColumnFilter | null` (new type in `src/lib/grid/customFilter.ts`:
  `{ join: FilterJoin; conditions: { columnId: string; op: FilterOperator; value: string }[] }`)
- `switches: Record<string, boolean>` — the generic home for per-tab toggles, so a tab can
  add one without touching this type.

Extend `src/lib/settings/grid.test.ts` for each new field: default, round-trip, garbage
input, and the legacy `sort`-to-`sorts` migration.

## Task 4: Cross-column advanced filter

- `src/lib/grid/crossFilter.ts` — pure `rowPassesCrossFilter(values, filter, kinds)`
  reusing `matchesCondition` from `customFilter.ts`. `crossFilter.test.ts` beside it:
  And vs Or, blanks, a condition naming a hidden column, a condition naming an unknown
  column (inert), empty condition list (inactive — a dialog with no rows must not empty
  the grid).
- `src/components/grid/GridFilterDialog.tsx` on `ModalShell` (see `modal-pattern.md`),
  OK/Cancel draft like `CustomFilterDialog.tsx`. Column select lists every `allColumns`
  entry with a `filterValue`, marking ones absent from the visible order as hidden.
  Operator select comes from `operatorsForKind(column.filterKind)`. Live expression preview
  reusing `describeCustom`'s shape.
- `DataGrid` applies the cross-filter in `displayRows` alongside the per-column pass.

## Task 5: Chip bar, result count, quick search

- `src/components/grid/GridFilterChips.tsx` — one removable chip per active per-column
  filter and per cross-filter condition, plus `Showing N of M` and `Clear all`. Renders
  above the header row; hidden entirely when nothing is active.
- `src/lib/grid/search.ts` — `rowMatchesSearch(values, query)`, case-insensitive substring
  across every filterable column's value. Tested for blank query (inert), multi-column hit,
  and a hit in a hidden column.
- Search box lives in the toolbar (Task 8). Debounce the _persisted_ write, not the local
  input, so typing stays responsive; `ux-principles.md` "do not move the world while the
  user is still typing" applies — the row set may narrow, but nothing re-sorts mid-edit.

## Task 6: User-chosen Group by

- Widen `GroupBy` in `src/lib/tree/slice.ts` to add `project`, `state`, `priorityLetter`,
  `deadlineBand`.
- `groupKey` (called at `slice.ts:432`) currently takes only `entry.context`; widen it to
  the whole `Prepared` entry so the new dimensions can read the node. `gatherByGroupKeys`
  needs the same. `emitGrouped`'s frame/`closeTo` machinery is unchanged — the group id
  scheme `group:dim:key|dim:key` already supports arbitrary nesting.
- Deadline bands reuse the vocabulary already in `filters.ts` `DEADLINE_PRESETS` /
  `lib/tree/status.ts` rather than inventing a second set of buckets.
- Extend `src/lib/tree/slice.test.ts` (or add one if absent) for each new dimension,
  including nesting two dimensions and correct header counts.
- Group headers become `sticky top-0` on desktop as they already are in compact
  (`DataGrid.tsx:962`); add Expand all / Collapse all writing `collapsedGroups` wholesale.

## Task 7: Multi-column sort and density

- `sortRowsWithinGroups` takes `Array<{ valueOf, direction }>` instead of one pair;
  compare in order, first non-zero wins. The two invariants in that file's header —
  headers stay put, only siblings reorder — are unchanged and must stay tested.
- `ColumnHeaderRow`: Shift-click appends/cycles a secondary sort; show `↑1 ↓2` style
  numbered indicators. Plain click still replaces the whole sort, so the common case is
  unchanged.
- `useGridState.toggleSort` gains a `shift` argument; `useTreeRowDrag`'s `headerSort` /
  `clearHeaderSort` become array-aware (drag still clears any sort that is not priority).
- Density writes `--row-height` as an inline style on the grid container in `DataGrid`,
  so header, rows and group headers all follow the one variable they already read.

## Task 8: Shared `GridToolbar`, and persist the ad-hoc switches

- `src/components/grid/GridToolbar.tsx` renders, from grid state: search box, `Filter…`,
  `Group by`, `Show Fields`, density, `Clear filters`, `Reset this grid`. It takes a
  `left` slot for tab-specific selects (Result Area, View, Project scope) and a
  `switches` array the tab declares as `{ id, label }` — each backed by
  `settings.switches[id]`, so a new toggle is one array entry and persists for free.
- Migrate `ProjectsGrid` (`groups`, `includeGoals`), `TasksGrid` (`groupByArea`,
  `showPurpose`), `GoalsGrid`, `WishesGrid`, `ChooserGrid` (`advancedFilters`),
  `NotesGrid` and `OutlineGrid` onto it. `useIncludeDeferred` folds into `switches`
  while keeping its tab-scope (not per-view) home and its default-true parse.
- `tabChrome.tsx`'s `ToolbarSelect` / `ToolbarToggle` / `ToolbarButton` stay as the
  primitives `GridToolbar` is built from; only the assembly moves.
- Below `md` the toolbar keeps the one-row horizontal scroll from `tabChrome.tsx:14`;
  `Filter…` and `Group by` open sheets, not popovers, per `responsive.md`.

## Task 9: Write the data-grid standard

New `agent-os/standards/components/data-grid.md`, registered in
`agent-os/standards/index.yml` under `components`. It states the rules this slice
establishes, so the next grid does not re-litigate them:

- Hierarchy is never broken by sort, filter, group or search — sorting reorders siblings
  only; filters keep ancestors that still have visible descendants.
- Drag-to-reorder is a first-class capability, not a fallback; it is disabled under an
  active non-priority sort and says so via the sort chip.
- Filtering, search and group-by operate on **defined** columns, not visible ones.
- Progressive filter disclosure: quick search → column funnel → cross-column builder.
- Filter state is always visible (chips + count) and always clearable in one action.
- Every user-visible grid preference persists to `grid:{tabId}` through the single
  `useGridState` patch, never to component `useState`.
- What we deliberately do **not** do, with reasons: virtualization, pagination,
  server-side sort/filter, aggregation footers, pivoting.
- The library decision and its expiry condition: revisit only if the grid starts
  accumulating table logic rather than app logic.

## Task 10: Verify, freeze specs, update roadmap

- Confirm every acceptance criterion by hand in the running app (see Verification).
- Fill **Changes from original plan**; mark this spec **frozen / complete (date)**.
- **Also freeze `agent-os/specs/2026-08-02-1208-custom-column-filters/`** — it shipped but
  was left `Status: active`; align its as-built section and move its follow-ups
  ("chip / summary of custom expression on the header", "cross-column expressions") into
  this spec's delivered list, since this slice delivers both.
- Update `agent-os/product/roadmap.md`: close the Phase 1 "Residual grid chrome polish"
  line and record the grid control surface as delivered.

---

## Verification

Automated:

```
npm run typecheck && npm run lint && npm run test:unit
```

New pure tests must exist and pass for `crossFilter`, `search`, extended `sortRows`
(multi-key), extended `slice` (new group dimensions) and extended `settings/grid`
(new fields + legacy `sort` migration).

This slice touches no database mutations — grid settings ride the existing `user_settings`
scope — so no new `*.integration.test.ts` is expected. If any mutation _is_ touched, the
cross-user rule in `agent-os/standards/development/testing.md` applies and
`npm run test:integration` must run with Postgres up (`npm run db:up`); a silent skip is
not a pass.

By hand, via the `run-planner` skill:

1. Projects tab → Show Fields, hide `Purpose` → set a Purpose filter from the builder →
   rows narrow correctly, chip appears, count reads `N of M`. **This is the bug fix.**
2. Reload → filter, chips, group-by, density, search and both switches all survive.
3. Group by Result Area → State → headers nest with correct counts, stick while scrolling,
   Collapse all / Expand all work.
4. Sort by Priority, Shift-click Deadline → `↑1 ↓2` indicators; a sub-project never
   appears above its parent and no group header moves.
5. Drag a row under an active non-priority sort → drag is refused with the sort chip
   explaining why; clear the sort, drag again, priority renumbers among new siblings.
6. Below `md` (narrow the window): toolbar scrolls in one row, `Filter…` and `Group by`
   open sheets, tap targets stay 44px.

## Follow-ups (new work — not amendments to this frozen spec)

- **Frozen first column on horizontal scroll.** Recommended by the UX research and still
  wanted; it interacts with the drag indicator's `nameColumnLeft` maths in `DataGrid.tsx`
  and deserves its own look.
- **Multi-level Group by from the toolbar.** The model nests; only the picker is one level.
- **User-saved named views** (`grid_views` table, view management chrome, cross-user
  integration tests) if the built-in presets stop being enough.
- **Day pane and Metrics** could adopt parts of `GridToolbar` if they ever grow controls.
- **Notes tab** still has its own `NoteFilterDialog` over subjects/contexts/flags. It is a
  domain filter, not a column filter, so it is not obviously wrong — but the two could be
  unified if the distinction stops being useful.
