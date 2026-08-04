# Data Grid

How every list in this app works. Read `ux-principles.md` first — this is the grid-specific
application of it.

There is **one** grid: `src/components/grid/DataGrid.tsx`, driven by `ColumnDef[]` and a
persisted `GridState` (`useGridState`), with its controls assembled by `GridToolbar`. The
Outline, Projects, Tasks, Goals, Wish List, Notes, Task Chooser and the Day list are all the
same component. A new list is a column array and a row slice, not a new grid.

## The one rule everything else serves

**Hierarchy survives every operation.** Sorting, filtering, searching and grouping change
_which_ rows you see and _in what order siblings appear_ — never who a row's parent is.

- **Sort reorders siblings only.** A sub-project never floats above its parent because its
  priority is higher; its subtree travels with it. `src/lib/grid/sortRows.ts` owns this and
  its two invariants are stated at the top of that file. Multi-column sort does not weaken
  them: extra keys refine how two _siblings_ compare and cannot change who is a sibling.
- **Group headers stay put** and never absorb rows from a neighbouring group.
- **Filtering keeps the shape.** A group header whose rows have all been filtered out is
  dropped; one that survives **restates its count** to the number actually under it. A
  header reading "Career (7)" above one visible row is a claim the user can see is false.

This is the reason we did not adopt a grid library. See "Why hand-rolled" below.

## Drag-to-reorder is a feature, not a fallback

Dragging a row is how work gets prioritised here, and dropping renumbers priority letter and
rank among the destination parent's children (`useTreeRowDrag`, `lib/tree/outlinePriority`).

- Drag is **compatible with a priority sort** and cleared by any other, because any other
  sort would immediately move the row away from where it was just dropped. Say so on screen
  rather than silently refusing.
- Drag is **desktop-only**. Below `md` the equivalent lives in the long-press menu — see
  `responsive.md`. Never make drag the only path to an outcome.
- Do not overload the drag gesture for grid configuration. A drag-a-column-header-into-a-zone
  Group By panel (AG Grid's pattern) competes with row drag; grouping is a toolbar picker
  here for exactly that reason.

## Grouping

- **Up to three levels**, chosen from progressive `Group by` / `then by` selects that appear
  as the level above them is filled. A dimension appears once — choosing one already in use
  moves it rather than nesting it inside itself. Clearing a level truncates the ones below,
  because there is nothing left for them to sit under. Rules live in `setGroupLevel`.
- **A tab's default arrangement is its default `groupBy`, never a separate toggle.** Projects
  opens on Category → Result Area; that used to be a `Groups` switch beside the picker, which
  meant `Group by → (None)` still showed headers. One control per thing, and the control
  shows the current state.
- This is why `groupBy` is `string[] | null`: null follows the tab's default, `[]` is the
  user having turned grouping off. Same distinction as `order`, and for the same reason.

## Inherited values are computed once, in `derive`

A value a row gets from its ancestry — L.A.P., shelving, category — is computed **once** in
`src/lib/tree/derive.ts` as a memoized walk up the tree, and exposed as a field on
`OutlineNode`. Never re-derive one at the point of use.

The rule is written against the **field**, not the type: category is set only on Result
Areas in practice, but `effectiveCategory` takes the nearest self-or-ancestor carrying one
whatever its type. Special-casing by type is how a value ends up meaning one thing to the
grouping code and another to the column.

**An inherited value that can be grouped by must also be a column.** Grouping by something
the grid cannot show is a header the user cannot account for — they can see the sections but
not the value that made them, cannot filter by it, and cannot sort by it. Category was in
exactly that state before it became a column.

## Filtering, searching and grouping act on _defined_ columns, not visible ones

Show Fields hides a column. It does not un-ask the question you asked about it.

- `DataGrid` takes both `columns` (visible, get a track and a cell) and `allColumns`
  (everything the tab defines). Filters, the advanced builder, quick search and the value
  pickers all evaluate against `allColumns`.
- A filter naming a column that **no longer exists** is **inert**, never failing. Treating a
  missing column as a blank cell empties the grid with nothing on screen to explain it —
  the exact bug this rule was written after. Same posture as `useGridState`'s degradation of
  a stale column `order`.
- **Sort is the exception**: sort keys resolve against the _visible_ columns. A filter on a
  hidden column is legible from its chip; a sort on one is a grid that has silently
  rearranged itself.

## Progressive disclosure: three rungs, in this order

| Rung | Control                                                                                                         | For                             |
| ---- | --------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| 1    | **Quick search** — one box, all columns, case-insensitive substring                                             | "I know a word that's in it"    |
| 2    | **Column funnel** — a set filter over that column's values, plus semantic ranges and per-column custom criteria | Focused refinement on one field |
| 3    | **Advanced filter** — And/Or across different columns, including hidden ones                                    | Real Boolean criteria           |

All three compose with **AND**: each answers a different question and a row must satisfy
every question asked. Do not add a fourth rung before the first three are outgrown.

Keep search dumb — substring only, no operators, no field syntax, no regex. Anything more
expressive belongs on rung 3, where the expression stays visible.

### The column funnel is a set filter

Modelled on AG Grid's and Excel's, because that is what people already know:

- **The values the column actually holds**, each with the **number of rows** carrying it, so
  you can see what a tick is worth before making it.
- **A search box over the list**, once there are more values than fit at a glance. It
  searches the **label**, not the stored value.
- **`(Select all)`** returns to showing everything. It is checked when the filter is
  inactive, indeterminate otherwise, and disabled when already showing all — a control that
  does nothing on click is worse than one that is visibly unavailable.
- **`only`** on each row narrows to that one value. Without it, isolating one value out of
  thirty means unticking twenty-nine.
- **`(Blanks)`** is an entry in the list, not a separate concept, and is omitted when no row
  is blank.
- Semantic **ranges** (priority bands, deadline windows) sit below the values under their
  own divider. They describe a range rather than name a value, so they keep plain
  add/remove behaviour.

Two rules the selection model depends on:

- **An empty selection means every entry is ticked**, because nothing is being filtered out.
  Drawing them unticked would say the opposite of what the grid is doing.
- **Ticking the last missing entry collapses back to "unfiltered"**, never to a list naming
  every current value — such a list would silently exclude any value added later.

There is deliberately no "select none": the stored model cannot express "show no rows", and
a control that can put the grid in a state it cannot describe is worse than one without it.
That is what `only` is for.

### Filter values may be stored and displayed differently

A column filters on whatever its cell shows — the State column stores Achieve's two-letter
codes because that is what a stored filter has to keep matching. `ColumnDef.filterLabel`
maps that to something pickable (`NS` → `Not started`). **Every surface that shows a value
must use it**: the set filter, and the chips. A chip reading `NS` beside a list reading
`Not started` looks like two different filters.

## Filter state is always visible and always clearable

Two of the three controls are invisible the moment their popover closes, so the grid must
say what it is doing:

- A **chip per active condition** (`GridFilterChips`), each removing only its own condition.
- **`Showing N of M`**, where `M` is the count _before_ any narrowing — a fraction whose
  bottom half also moves says nothing about how much has been filtered out. Group headers
  are not counted; they are chrome, not results.
- One **Clear all** that clears column filters, the advanced filter and the search together.
- An empty builder is **inactive**, not "match nothing". A dialog the user opened and left
  empty must never empty the grid.

## Persistence

**Every user-visible grid preference goes into the `grid:{tabId}` scope through the single
`patch` in `useGridState` — never into component `useState`.** Column set / order / widths,
filters, advanced filter, search, sorts, group-by, group collapse, density, sub-view, and
per-tab switches.

- **One hook owns the whole scope.** A write replaces the scope's value, so two hooks each
  persisting one field would clobber each other — changing a filter would reset the column
  layout. See the header comment on `useGridState.ts`.
- **Per-tab toggles go in the open `switches` map**, declared by the tab as
  `{ id, label, defaultOn }`. A new toggle is one array entry; a removed one leaves a
  harmless orphan key rather than a parse failure. The tab supplies the default, because
  only the tab knows whether off or on is the sane start.
- **Parsing never throws and never strands a tab.** Garbage degrades to the default; a
  shape from an older build is read rather than discarded (`sort` → `sorts`, bare `string[]`
  → options filter). An explicitly empty collection is honoured — "show me nothing" is a
  legal choice.
- Tab-wide settings (`includeDeferred`) keep the **tab** scope; per-view settings keep the
  **view** scope (`grid:tasks.active-status`). Putting a per-view setting on the tab makes
  it fight whichever view you are not looking at.

## Toolbar

`GridToolbar` renders the shared controls from `GridState`; the tab supplies only what is
its own, through `left` (scope and view pickers) and `right` (record actions).

A tab declares **what it has** — columns, switches, group dimensions. It does not assemble
buttons. If you find yourself adding a control to one grid, add it to `GridToolbar` instead
and let every grid have it.

Keep _commands_ and _view controls_ in separate bars where a view has many commands (the
Outline: add / indent / delete in `FilterBar`, search / filter / fields / density in
`GridToolbar`). They are different kinds of thing and mixing them makes both harder to find.

Below `md` the toolbar is one horizontally-scrolling row, and dialogs open as sheets — see
`responsive.md`. Tap targets stay 44px; that is not covered by the accessibility exemption
in `ux-principles.md`.

## What we deliberately do not do

| Not doing                     | Why                                                                                                                                                                                                                                    |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Virtualization**            | Personal data volumes. The row layer is CSS grid plus HTML5 drag and would fight a virtualizer for no gain we can currently measure.                                                                                                   |
| **Pagination**                | Same. Pagination also breaks "scroll to the row I was just looking at", which is how these grids are actually used.                                                                                                                    |
| **Server-side sort / filter** | Everything is already in memory from one recursive CTE. Round-tripping a keystroke would be slower, not faster.                                                                                                                        |
| **Aggregation footers**       | The numbers that matter — effort, effort left, % complete — already roll up the _tree_ in `derive.ts`. A second, group-shaped sum of the same field in the same column would be a different number with no way to tell which is which. |
| **Pivoting**                  | No question anyone has asked of this data needs it.                                                                                                                                                                                    |
| **User-saved named views**    | Built-in presets plus persisted switches cover it so far. Revisit when the presets demonstrably do not.                                                                                                                                |

## Why hand-rolled, and when to revisit

Decided in `specs/2026-07-28-1121-main-grid-tabs`, re-confirmed in
`specs/2026-08-04-0924-grid-control-surface`:

- **AG Grid and MUI X Data Grid** — rejected on licensing. Tree data, row grouping and set
  filters are Pro/Premium/Enterprise in both, which is precisely the feature set wanted.
- **TanStack Table** (MIT, headless, genuinely capable) — rejected because it uses `subRows`
  for **both** tree data (`getSubRows`) and grouping (`getGroupedRowModel`), so the two are
  mutually exclusive. Every grid here needs hierarchy _and_ group headers at once. Its
  sort/filter/visibility state is also in-memory, where ours already persists to Postgres —
  adopting it means writing an adapter to arrive back where we started.

**Revisit when the grid starts accumulating _table_ logic rather than _app_ logic** — a
virtualizer, a pagination model, a server-side query builder. Until then the hand-rolled
grid is smaller than the adapter a library would need.

## Testing

Per `development/testing.md`: the logic lives in `src/lib/grid/**` and `src/lib/tree/**`
with a test beside it, and there are **no React component tests**. The pure modules worth
knowing about:

| Module                     | What it owns                                         |
| -------------------------- | ---------------------------------------------------- |
| `lib/grid/sortRows.ts`     | Hierarchy-preserving multi-key sort                  |
| `lib/grid/customFilter.ts` | Operator vocabulary and per-column expressions       |
| `lib/grid/crossFilter.ts`  | Cross-column And/Or advanced filter                  |
| `lib/grid/search.ts`       | Quick search matching                                |
| `lib/grid/chips.ts`        | What the chip bar says                               |
| `lib/grid/distinct.ts`     | Distinct values, shared by funnel and builder        |
| `lib/settings/grid.ts`     | The persisted shape, its defaults and its migrations |
| `lib/tree/slice.ts`        | Row slice, group dimensions and header counts        |

A test earns its place if it would fail on a plausible mistake. The mistakes this area
actually makes are: a filter that silently matches nothing, a sort that lifts a child above
its parent, a count that does not match the rows beside it, and a stored blob that strands a
tab after an upgrade. Test those.
