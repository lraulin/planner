# Main Grid Tabs — Projects, Tasks, Goals, Wish List

**Status: frozen / complete** (2026-07-28)  
Spec folder: `agent-os/specs/2026-07-28-1121-main-grid-tabs/`

> Status classified retroactively on 2026-08-27. This spec predates the status-line
> convention and carries no acceptance checkboxes; the date above is its last
> implementation commit. It is a historical as-built record — further change opens a
> new delta-spec.

## Context

The Outline tab and the four per-type detail forms are done. The next Achieve surfaces to
replicate are its four list tabs: **Projects**, **Tasks**, **Goals**, and **Wish List**.
Each is the same grid machinery showing a different slice of the same hierarchy, with a
scope picker, a named **View** preset, group-by toggles, per-column filter dropdowns, and a
column chooser.

They are separate tabs rather than one grid with a type filter because the column sets
genuinely diverge — Goals shows Title/Definition/Range, Wish List shows Priority/Type/
Title/Description over `node_items` rather than `nodes` at all — and because column
customization should be remembered per type. Fidelity to Achieve first; personal tweaks
after it works.

Building these forces three things that don't exist yet: a **column-definition
abstraction** (the outline hardcodes one `GRID_TEMPLATE`), a **derived schedule status**,
and a **cross-node query over `node_items`**.

## Decisions

- **Hand-rolled shared grid, no new dependency.** The repo has five runtime deps and no UI
  library. The hard half of a data grid — flattening the tree, persisting collapse,
  computing rollups and L.A.P. — is already solved server-side in `derive.ts`, and every
  cell editor is already written. TanStack Table would supply sorting, filter state and
  column-order state (a few hundred lines) while still leaving the cells, the Show Fields
  dialog and the semantic filter presets to hand-write, and its row model would have to be
  reconciled with server-persisted collapse and the optimistic patch layer. MUI X and AG
  Grid are out on licensing: tree data, row grouping and set filters are all paid tiers.
- **The outline migrates onto the shared grid in the same spec.** A sibling implementation
  would fork the cell editors and drift. Per Lee's instruction, no sunk-cost — the outline
  becomes "the shared grid with the outline's columns, grouping off".
- **One widened `loadOutline`, not a second query.** Adding three LEFT JOINs and ~8 columns
  keeps one tree query, one `derive`, one `OutlineNode` type, and lets every tab reuse
  rollups and L.A.P. for free. Rejected: per-tab narrow queries, which would drift from
  `derive` and lose rollups.
- **Views ship as built-in, non-editable presets.** Column show/hide and reorder are live
  and persist to `localStorage` per tab. No schema change, no user-settings table.
- **Schedule status is derived, never stored** — a pure function beside `derive.ts`.

## Task 1: Save spec documentation

Create `agent-os/specs/2026-07-28-1121-main-grid-tabs/` with `plan.md` (this plan),
`shape.md`, `standards.md` (full text of `components/ux-principles.md` and
`components/drawer-pattern.md`, each with a "Why it applies" preamble), and
`references.md`.

No `visuals/` folder this time — `references.md` points at `screenshots/main tabs/` by
path instead, since Task 2 removes screenshots from git.

## Task 2: Untrack screenshots from git

- `git rm -r --cached screenshots` (files stay on disk).
- Add `/screenshots` and `agent-os/specs/**/visuals/` to `.gitignore`.
- The ~20 MB already in history stays; not worth a rewrite for a personal repo.

**Verify:** `git status` shows no screenshot deletions pending beyond the untracking, and
`git check-ignore -v "screenshots/main tabs"` matches.

## Task 3: Derived schedule status

New `src/lib/tree/status.ts`:

```ts
export type ScheduleStatus =
  | "completed"
  | "overdue"
  | "due_today"
  | "due_tomorrow"
  | "close_to_deadline"
  | "due_soon"
  | "on_schedule";

export function scheduleStatus(
  deadline: Date | null,
  today: string,
  state: NodeState,
): ScheduleStatus;
```

Rules, evaluated most urgent first (Lee's definition): completed/cancelled → Completed;
no deadline → On Schedule; past → Overdue; today → Due Today; +1 day → Due Tomorrow;
within 2 days → Close to Deadline; within 5 days → Due Soon; else On Schedule.
`STATUS_LABELS` maps to Achieve's wording. Compared as `YYYY-MM-DD` strings against the
client's `today`, matching how `DeadlineCell` already decides "overdue".

**Verify:** `src/lib/tree/status.test.ts` covers each band and both boundaries.

## Task 4: Widen the outline query

In `src/lib/tree/queries.ts`, add `LEFT JOIN project_details pd` and `LEFT JOIN
goal_details gd`, and select `td.target_start_date`, `pd.project_start`, `pd.target_end`,
`pd.purpose`, `pd.assigned_to`, `gd.definition`, `gd.range`, `gd.is_dream`. Add the
matching fields to `OutlineRow` in `src/lib/tree/types.ts` and map them in the row mapper.

Add a single `targetStart` accessor that resolves to `projectStart` for projects and
`targetStartDate` for tasks, so the Target Start column has one source.

Also add `STATE_CODES: Record<NodeState, string>` to `src/lib/tree/hierarchy.ts`, beside
the existing `STATE_LABELS` / `STATE_OPTIONS`, backing Achieve's **Abbreviated State**
column: `NS` Not Started, `IP` In Progress, `W` Waiting, `C` Completed, `Cn` Cancelled,
`P` Postponed, `D` Delegated, `SD` Should Delegate, `PR` Proposed. Extend
`src/components/detail/itemKinds.test.ts`'s completeness idiom with a test asserting every
`nodeStateEnum` value has a code.

**Verify:** `npm run typecheck`; the outline still renders after `npm run db:seed`.

## Task 5: The tree slice

New pure module `src/lib/tree/slice.ts`, tested like `derive.ts`:

```ts
export type GridRow =
  | {
      kind: "group";
      id: string;
      label: string;
      count: number;
      depth: number;
      collapsed: boolean;
    }
  | { kind: "node"; id: string; node: OutlineNode; depth: number; context: RowContext };

export function sliceTree(
  nodes: OutlineNode[],
  opts: {
    keep: (node: OutlineNode) => boolean;
    groupBy?: ("category" | "resultArea" | "goal")[];
    scopeId?: string | null; // subtree root — the Result Area or Project picker
    includeDeferred: boolean;
  },
): GridRow[];
```

Two things it must get right:

1. **Re-based depth.** A project nested under a goal loses its parent from the row set, so
   `depth` is recomputed as the count of _kept_ ancestors — sub-projects and sub-tasks stay
   indented under their own kind.
2. **Inherited context.** `RowContext` carries the nearest ancestor result area (name,
   colour) and its `category`, plus the nearest ancestor goal. `category` lives only on
   `result_area_details`, so grouping by it means walking up.

**Verify:** `src/lib/tree/slice.test.ts` — a project under a goal re-bases to depth 0; a
sub-project sits at depth 1; group headers carry correct counts; scoping to a result area
excludes siblings.

## Task 6: The shared grid

New `src/components/grid/`, built by extracting from `OutlineGrid.tsx` /
`OutlineRow.tsx` rather than writing fresh:

- **`columns.ts`** — `ColumnDef<Ctx>`: `{ id, label, width, align, render(row, ctx),
sortValue?(row), filterValue?(row), filterKind?: "text" | "priority" | "date" | "enum" }`.
  The grid builds its CSS `grid-template-columns` from `width`, replacing the hardcoded
  `GRID_TEMPLATE`.
- **`cells.tsx`** — `NameCell` (spine + expander + `TypeIcon` + `NameEditor`),
  `PriorityCell`, `EffortCell`, `DeadlineCell`, `StateCell`, `FocusCell`, plus new
  `AbbrStateCell`, `PercentCell`, `StatusCell`, `TextCell`, `ReadOnlyCell`. Lifted from
  `OutlineRow.tsx:241-453`, which is where they currently live as private components.
  Preserve the existing idioms exactly: commit on blur and Enter, revert and flag on
  Escape/unparseable, `key`ed on the formatted stored value, `stopPropagation` on click.
  `AbbrStateCell` is `StateCell`'s narrow twin — the same `<select>` writing through
  `setStateAction`, displaying `STATE_CODES[state]` instead of the full label.
- **`DataGrid.tsx`** — renders `GridRow[]` against `ColumnDef[]`. Owns selection, the
  optimistic `patches`/`apply` pair (lifted from `OutlineGrid.tsx:107-135`), the document
  keyboard hook, group-header rows with collapse, sorting, and filter state.
- **`filters.ts`** — `(All)` / `(Custom)` / `(Blanks)` / `(NonBlanks)` plus distinct values
  computed from the rows, with the semantic presets from the screenshots: priority
  (`Only A1`, `Only Ranked As`, `Only As & Bs`, `Ranked`, `Unranked`, …) and deadline
  (`Past & None`, `Next 7 Days`, `Today & Future`, …). Pure and unit-tested.
- **`ColumnHeader.tsx`** — label, sort indicator, filter funnel button opening the dropdown.
- **`ShowFieldsDialog.tsx`** — available/shown lists, Move Up/Down, Reset. Uses the
  existing `Drawer`/dialog chrome and `useModalFocus` from `src/components/detail/focus.ts`.
- **`useGridColumns.ts`** — visible column ids + order, persisted to `localStorage` keyed by
  tab id, falling back to the active View's preset.

Then migrate `OutlineGrid` onto `DataGrid` with `groupBy: []`, keeping its tree commands
(indent/outdent/move/collapse) and `useOutlineKeyboard` bindings unchanged.

**Verify:** the Outline tab behaves exactly as before — arrows, `Insert`/`⌘Enter`,
`Tab`/`Shift+Tab`, `Alt+↑/↓`, `F2`, `Enter`-opens-drawer, `Delete`-confirms, inline edits
commit and revert. `npm run typecheck && npm run lint`.

## Task 7: Shell — routing and the tab strip

- Move `TabStrip.tsx` from `src/components/outline/` to `src/components/shell/`.
- Add `goals` and `wishes` to `TABS`; flip `projects`, `tasks`, `goals`, `wishes` to
  `built: true`; swap the `<span>` for `next/link` `<Link>` (the repo currently has no
  `next/link` import anywhere).
- In `src/app/outline/actions.ts` and `detail-actions.ts`, change the hardcoded
  `revalidatePath("/outline")` in `run()` to `revalidatePath("/", "layout")` — otherwise a
  mutation from `/projects` refreshes a page the user isn't on.

**Verify:** clicking each tab navigates; editing a priority on `/projects` persists after a
reload.

## Task 8: Projects tab

`src/app/projects/page.tsx` (`force-dynamic`, `loadOutline` → `ProjectsGrid`).

- Scope: **Result Area** picker (`All Result Areas` + one per area) as a dropdown, not a
  modal.
- Toggles: **Groups** (Category → Result Area headers), **Goals** (include goal rows as
  parents), **Deferred** (include `postponed`).
- Views (built-in presets, from the screenshots): Active Project Status, Active Project
  Schedule, Active Project Purpose, Active Project Delegation, Completed Projects, All
  Projects. Recurrence and Printing are out of scope.
- Active Project Status columns: Abbreviated State, Priority, Name, Tasks
  (`activeCount/childCount`), Effort, Effort Left, Target Start, Deadline, %, Status,
  L.A.P. — the Show Fields dialog in screenshot 10.59.38 lists exactly this set, in this
  order. Note the two distinct columns: **State** is the stored `nodes.state`, rendered as
  its code and editable via dropdown; **Status** is the derived, read-only schedule status
  from Task 3.
- `Enter` / double-click opens the existing `NodeDetailDrawer`; `F2` renames inline.

**Verify:** grouped and flat renders match `screenshots/main tabs/` 10.44.24 and 10.45.45;
switching View swaps columns; the Priority filter's `Only Ranked As` behaves.

## Task 9: Tasks tab

`src/app/tasks/page.tsx`.

- Scope: **Project** picker with a filter box and a tree of projects — as a popover, not
  Achieve's modal, per `ux-principles.md`. Includes `<All Projects>` and `<No Project>`.
- Toggles: **Group by Area**, **Deferred**, **Project's Purpose** (reveals a read-only
  purpose panel above the grid, sourced from `project_details.purpose`).
- Views: Active Task Status, Active Task Schedule, Completed Tasks, All Tasks.
- Columns: Abbreviated State, Priority, Name, Effort, Effort Left, Deadline, %, Status.

**Verify:** picking a project scopes the list to its subtree; sub-tasks stay nested;
Project's Purpose panel appears and is read-only.

## Task 10: Goals tab

`src/app/goals/page.tsx`. Result Area scope picker; Views: All Goals / Active Goals /
Completed Goals. Columns: Priority, Title, Definition, Status, Deadline, Range — where
**Status here is `nodes.state`**, spelled out in full ("Not Started") rather than coded,
and not the derived schedule status the Projects tab shows under the same header — so this
column is `StateCell`, not `StatusCell` or `AbbrStateCell`. Grouped by Result Area.
Sub-goals nest.

`definition` and `range` are inline-editable text, writing through a new
`setGoalFieldAction` that reuses `saveNodeDetailAction`'s allowlist path.

**Verify:** matches screenshot 10.46.24; editing Definition inline persists and shows in
the drawer's Goal form.

## Task 11: Wish List tab

The only tab whose rows are `node_items`, not `nodes`.

- New `src/lib/detail/wishQueries.ts` → `loadWishList(userId)`: selects `node_items` where
  `kind` is one of the four `wish_*` kinds, joined to `nodes`, with the nearest
  result-area ancestor resolved by recursive CTE for grouping. There is currently no
  cross-node `node_items` query in the repo.
- Columns: Priority, Type (`W/DH`, `DW/DH`, `W/H`, `W/A` — from the kind), Title,
  Description. Grouped by Result Area. Result Area scope picker.
- Inline editing writes through the existing `updateNodeItemAction`; `Enter` opens the
  owning node's drawer on its Wishes tab.

**Verify:** matches screenshot 10.46.54; a wish added in a Result Area drawer appears here;
editing a title here shows in the drawer.

## Verification

1. `npm run db:up && npm run db:seed`, then `npm run dev`.
2. **Outline unchanged** — walk the full keyboard map and every inline editor.
3. Each new tab against its screenshot in `screenshots/main tabs/`: grouping headers with
   counts, View switching, column filters (including the Priority and Deadline presets),
   Show Fields add/remove/reorder surviving a reload.
4. Hierarchy: a sub-project indents under its parent project on the Projects tab; a
   sub-task under its parent task on Tasks.
5. Drawer opens from every tab and saves back; the grid reflects it without a manual
   refresh.
6. `npm test && npm run typecheck && npm run lint && npm run format:check`.

## Open questions

- Achieve's **Groups** toggle appears to control both the Category and Result Area header
  levels together; the screenshots don't isolate them. Built as one toggle; revisit.
- What Achieve shows in **Status** for a completed item — assumed "Completed".
- The **L.A.P.** column is assumed to be `derive.ts`'s inherited ancestor priority; still
  unconfirmed from the prior spec.
