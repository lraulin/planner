# References for Grid aggregation placement

## Governing specs

### `agent-os/specs/2026-08-04-0924-grid-control-surface/` — frozen 2026-08-04

- **Relationship:** Extends.
- **Relevant decisions:** The spec whose durable rules were extracted into
  `agent-os/standards/components/data-grid.md`, and which states that future work in this area
  opens a new delta rather than editing that folder. Carries forward: group headers restate
  their count after filtering (`plan.md:103`) — the precedent this spec follows for totals —
  and group headers are sticky on desktop with nested levels stacking by depth (`plan.md:104`),
  which the per-column header must not disturb.

### `agent-os/specs/2026-08-21-1403-commitments-expected-vs-income/` — frozen 2026-08-23

- **Relationship:** Supersedes, narrowly — only the _placement_ of the group-header figures.
- **Relevant decisions:** D2 (`plan.md:42-46`) established that group headers show the same
  figures as the footer for the rows beneath them, restated after a filter the way the count is,
  counting only active rows so a cancelled group reads $0.00. All of that carries forward
  unchanged. `shape.md:20-22` records why it exists: "a Housing header with a count still made
  you add the rows." What is superseded is only how it was built — a labelled run left of the
  label, decided in delivery commit `3adc2e7` and never written back into the spec.

### `agent-os/specs/2026-08-26-0910-supplies-worksheet/` — frozen 2026-08-26

- **Relationship:** Supersedes, narrowly — only the form of its grand total.
- **Relevant decisions:** "Footer totals are the sum of the displayed row values, so the column
  visibly adds up" (`plan.md:100-101`) survives and is better served by a column-aligned row;
  "group headers subtotal; the footer shows a grand total per period" (`plan.md:121`) is
  unchanged in substance. `plan.md:330-331` describes the `est. $X/mo · budgeted $Y/mo · funded
from …` header text, whose prose half becomes `groupNote` because it has no column to sit in.

### `agent-os/specs/2026-08-23-2313-one-budget/`

- **Relationship:** Extends — reaffirmed, not replaced.
- **Relevant decisions:** "Each table carries its own subtotal; one footer under Spending sums
  both" (`plan.md:85`) is exactly the arrangement D4 preserves against a per-grid footer.
  See also `2026-08-24-0930-envelope-sections/plan.md:46,52` (groups exist only where the user
  wants subtotals inside a section; Savings carries its own subtotal) and
  `2026-08-25-1310-budget-funding-indicators/plan.md:101` ("Group headers do not get bars").

### `agent-os/specs/2026-08-26-2022-split-transactions/` — frozen at `dd9037c`

- **Relationship:** None, deliberately. The Register is untouched. Noted because summing a
  split parent alongside its children is precisely the double-count that D3's rule prevents,
  and because Register aggregation would have landed on this spec's code.

### `agent-os/specs/2026-08-24-1945-register-prepared-rows/`

- **Relationship:** None, but load-bearing for D3 — it is the spec that made the Register a
  server-prepared navigable index with a viewport, which is why its totals cannot be a client
  reducer.

## Implementation references

### The one line to change

- **Location:** `src/components/grid/DataGrid.tsx:1687`
- **Relevance:** `gridColumn: 1 / span ${columnCount}` is what flattens the group header into a
  single track. The header already receives the correct `gridTemplateColumns` at 1679, so this
  is the whole of the structural problem.
- **Key patterns:** `columnCount = columns.length + 1` (`:1116`) — the `+1` is the drag-handle
  gutter, which is track 1 and the off-by-one worth a test.

### The comment that records the failed attempt

- **Location:** `src/components/grid/DataGrid.tsx:1699-1707`, from commit `3adc2e7`
- **Relevance:** Explains why `ml-auto` was abandoned. Its premise only holds while the header
  spans every column; replace it rather than delete it, so the approach is not retried.

### The row to copy

- **Location:** `src/components/grid/DataGrid.tsx:1415-1423` (`DataRow`)
- **Key patterns:** one `role="gridcell"` per column with
  `alignClass(column.align)`. A total cell built the same way lines up under its values by
  construction rather than by tuning. `alignClass` and `ColumnMeta` live at
  `src/components/grid/columns.ts:83-152`; `ColumnMeta` carries `width` and `align` and no row
  type parameter, so a totals row can be rendered from it the way `ColumnHeaderRow` already is
  (`src/components/grid/ColumnHeader.tsx:124`).

### The two consumers being converted

- **Location:** `src/components/finances/budget/BudgetView.tsx:688-701`, wired at 916, 962, 1030
- **Key patterns:** `groupTotals()` ignores the `nodes` argument and re-derives from
  `sections.*` by id via `descendantEnvelopeIds`; the arithmetic is `budgetTotals`
  (`src/lib/finances/budget/rows.ts:51-60`). Target columns `assigned` / `activity` / `balance`
  at `budgetColumns.tsx:82-125`, all `align: "right"` — a 1:1 map.
- **Location:** `src/components/finances/supplies/SuppliesView.tsx:327-350`, footer at 363-377
- **Key patterns:** the summary mixes money with prose, which is why the prop splits. Group rows
  are hand-built at 99-131 with the comment "Group headers are built here rather than by the
  grid's own grouping: the header has to carry a subtotal and an envelope". Totals come from
  `supplyGroups` / `supplyGrandTotals` (`src/lib/finances/supplies/rows.ts`, `addTotals` 102-112),
  whose doc at 114-119 already states the footer is the sum of displayed values. Target columns
  `biweekly` / `monthly` / `yearly` at `suppliesColumns.tsx:391-432`, all `align: "right"`.

### Why the Register cannot join them

- **Location:** `src/components/finances/useRegisterSource.ts:206-219`,
  `src/lib/finances/registerQuery.ts:58-60` and `312-390`,
  `src/components/grid/DataGrid.tsx:611-613`
- **Relevance:** `RegisterIndexEntry` carries `{kind, id, label, count, depth}` and nothing more;
  unloaded rows become `placeholder(entry.id)` and draw as skeletons, so `groupMembers` would
  see mostly placeholders. `preparedDisplay` short-circuits the client pipeline entirely, so
  `filteredRows === rows`. This is the evidence behind D3.
- **Key patterns:** if Register totals are ever wanted, `prepareRegister` already walks the
  matched ledger and back-fills `count` in `closeTo` (`src/lib/finances/grouping.ts:188-194`);
  an `amountCents` accumulator on `Frame` (`:180-185`) is where it goes.

### Test to model on

- **Location:** `src/lib/finances/grouping.test.ts:88-101`
- **Relevance:** "counts the rows under each header, not the months of the year" is the shape a
  `totalsLayout` test should copy — assert the property that a plausible mistake would break,
  not the implementation.

## Follow-ups noted during shaping (not this spec)

- Three near-identical `Amount` components: `financeColumns.tsx:74-90`,
  `statementColumns.tsx:38-46`, and Budget's own. One shared money cell would be the right model.
- `statementColumns.tsx` has money columns and no `align: "right"` on any of them.
- No finance/money-formatting standard exists anywhere under `agent-os/standards/`.
- A sticky first column during horizontal scroll, now that totals live in far-right columns.
