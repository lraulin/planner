# Grid Control Surface — Shaping Notes

**Status: frozen / complete (2026-08-04)**

## Scope

Finish the grid customization story by moving capability out of individual tabs and into
the shared grid. A tab should declare **what it has** — its columns, its switches, its
group dimensions — and the shared grid should supply **how you control them**.

Concretely, this slice delivers:

1. Filtering, searching and grouping that operate on every column the tab **defines**,
   not only the ones currently visible.
2. A cross-column advanced filter builder (AND/OR across different columns).
3. Visible filter state: removable chips, `Showing N of M`, one-click Clear all.
4. A quick search box per grid.
5. A user-chosen Group by, replacing each tab's hardcoded `groupBy` array.
6. Multi-column sort and a density toggle.
7. A shared `GridToolbar`, and per-tab switches persisted like every other grid preference.
8. A written `components/data-grid.md` standard so the next grid inherits all of it.

### Out of scope

- **User-saved named views.** Built-in presets plus persisted switches only. A `grid_views`
  table, view management chrome, and its cross-user integration tests are a spec of their
  own size. Revisit if daily use shows the presets are not enough.
- **Virtualization / pagination / server-side sort and filter.** Personal data volumes; the
  row layer is CSS grid + HTML5 drag and would fight a virtualizer. Revisit only if a grid
  actually gets slow.
- **Aggregation footers and pivoting.** Grok's research recommends aggregation alongside
  grouping, and it is right for analytics grids. These are planning grids: the numbers that
  matter (effort, effort left, % complete) already roll up the tree in `derive.ts`, and a
  second, group-shaped sum of the same field would be a different number in the same column.
- **Frozen first column on horizontal scroll.** Worth doing, but it interacts with the drag
  indicator's `nameColumnLeft` maths (`DataGrid.tsx:903`) and deserves its own look.
- **Migrating to a grid library.** Settled below.

## Decisions

### Keep the hand-rolled grid — the 2026-07-28 rejection still holds

`2026-07-28-1121-main-grid-tabs` rejected TanStack Table on the grounds that it supplies the
easy half. Re-checked against the code as it stands, that has hardened rather than softened:

- **Grouping and tree data are mutually exclusive in TanStack.** It uses `subRows` for both
  `getSubRows` (hierarchy) and `getGroupedRowModel` (grouping). Every grid here needs
  hierarchy _and_ group headers at once, which is exactly the combination it cannot express.
- **Its state is in-memory; ours already persists.** Sort, filters, column visibility, order
  and widths live in Postgres `user_settings` via `useSetting`
  (`2026-07-31-1520-persistent-ui-state`). Adopting TanStack means writing an adapter to
  arrive back where we started.
- **The two features worth migrating _for_ already work.** Hierarchy-preserving sort
  (`src/lib/grid/sortRows.ts`, 149 lines, tested) and tree drag-drop (`useTreeRowDrag`,
  `lib/tree/dnd`) are the hard parts, and they are done.
- The migration would re-plumb every cell renderer, the drag gesture, group headers and the
  compact row for a net-negative feature yield.

TanStack does have one genuine edge — filtering is naturally independent of column
visibility, which is precisely the bug found below. That is a dozen lines to fix here.

AG Grid and MUI X Data Grid stay rejected on licensing: tree data, row grouping and set
filters are Pro/Premium/Enterprise in both — precisely the features wanted.

**Expiry condition** (recorded in the standard): revisit if the grid starts accumulating
_table_ logic rather than _app_ logic — a virtualizer, a pagination model, server-side
query building.

### The problem was never the row layer

Every grid — Outline, Projects, Tasks, Goals, Wish List, Notes, Chooser, Day — already
renders through one `DataGrid` + `useGridState` + `ShowFieldsDialog`. What is duplicated is
the **toolbar**: each tab hand-assembles roughly eight buttons, and its distinguishing
switches (`groups`, `includeGoals`, `groupByArea`, `showPurpose`, `advancedFilters`) sit in
plain `useState`, so unlike everything in `useGridState` they vanish on reload. That
asymmetry is the "specialized capabilities per grid" the brief is about.

### A live bug, found while shaping

`DataGrid.tsx:301-305` builds each row's filter values from the **visible** `columns`, but
`rowPassesFilters` (`filters.ts:274`) iterates **every stored filter**. Hide a column that
has an active filter and each row is tested against `null`, so nothing matches — the grid
empties, with no funnel on screen to explain why. Task 2 is therefore both the foundation
for the advanced filter and a bug fix, and it lands first.

### Advanced filter: cross-column builder, per-column funnels retained

The brief's requirement — "advanced filter should make it possible to filter by columns that
are not visible" — could be met by fixing the bug alone. It is worth more than that: a
single `Filter…` panel listing every defined column, with AND/OR across columns, using the
operator vocabulary `2026-08-02-1208-custom-column-filters` already built
(`src/lib/grid/customFilter.ts`). Per-column funnels stay, because progressive disclosure
means the cheap path stays cheap: quick search → column funnel → cross-column builder.

Hidden columns are labelled as hidden in the builder rather than excluded, so a filter on
something off screen is never invisible.

### Filter state must be visible

Grok's research is right that this is where grids usually fail. Chips above the grid, one
per active condition, each removable; `Showing 47 of 312`; one `Clear all`. The existing
`Clear Filters` toolbar button gave the action without the information.

### Grouping stays hierarchy-first

Grok recommends AG Grid's drag-into-a-drop-zone Row Group Panel. Rejected as the primary
control: dragging a column header into a zone competes with dragging a _row_, which is a
first-class gesture on every grid here and the one thing the brief says must not be lost.
A `Group by` picker in the toolbar with ordered dimensions gets the same capability without
overloading drag. `sliceTree`'s `emitGrouped` frame machinery already nests arbitrarily —
only the `GroupBy` union and `groupKey`'s signature need widening.

Adopted from the research: counts in headers (already there), sticky group headers on
desktop (already true in compact, `DataGrid.tsx:962`), Expand all / Collapse all.

### What we keep from Achieve, and where we improve on it

Kept, non-negotiable:

- **Hierarchy survives every operation.** Sort reorders siblings only; a sub-project never
  floats above its parent.
- **Drag to reorder, and drag to set priority.** `useTreeRowDrag` renumbers letter/rank
  among the destination parent's children.

Improved on Achieve:

- Filter state is shown as chips with a count rather than only a funnel glyph.
- Filters reach columns Achieve would require you to un-hide first.
- Group by is a user choice, not a fixed per-view arrangement.
- Every preference persists to the server, so it follows the user across devices — Achieve
  kept these in a local file.

## Context

- **Visuals:** `visuals/filter-panel.md` — ASCII sketch of the cross-column builder and the
  chip bar, agreed during shaping.
- **References:** see `references.md`.
- **Product alignment:** closes the Phase 1 "Residual grid chrome polish" line in
  `agent-os/product/roadmap.md`. No new phase, no new schema.

## Standards Applied

- `components/ux-principles` — context preservation, progressive disclosure, keyboard-first
  on desktop / touch-complete on phone, and the "do not move the world while the user is
  still typing" rule that governs search debounce and re-sort timing.
- `components/responsive` — the toolbar's one-row horizontal scroll below `md`, 44px tap
  targets, sheets rather than popovers for `Filter…` and `Group by`, drag stays desktop-only.
- `components/modal-pattern` — `GridFilterDialog` is built on `ModalShell` with an
  OK/Cancel draft, like `CustomFilterDialog` and `ShowFieldsDialog`.
- `development/testing` — the new logic (`crossFilter`, `search`, multi-key `sortRows`, new
  group dimensions, settings parse/migration) is pure and lives in `src/lib/**` with tests
  beside it. No React component tests. No DB mutations are touched, so no new integration
  tests are expected.
