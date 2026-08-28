# References for One Budget export

## Governing specs

### `agent-os/specs/2026-08-14-1021-grid-export-formats/`

- **Relationship:** Supersedes (D1 only).
- **Relevant decisions:** D1 named three formats; this spec makes it four. D3 (CSV is the
  visible columns, on-screen order, human-readable cell text, no group headers) and D4/D5
  (structured formats nest by the depth the grid is showing, via the one forest helper) are
  kept verbatim and are what the section serializers reuse. D7 — the command list must stay
  identity-stable and read its snapshot from a ref — is the constraint `BudgetView` inherits
  when it takes over registration from `DataGrid`.

### `agent-os/specs/2026-08-14-1045-export-clipboard/`

- **Relationship:** Extends.
- **Relevant decisions:** D2/D3 — Option swaps the Export leaves to `Copy … to Clipboard`, and
  a permanent `File ▸ Copy to Clipboard ▸` carries the same formats. Both come free from
  `gridExportCommands` / `gridCopyCommands`, which is why `BudgetView` calls those rather than
  writing its own commands. D7 — clipboard writes are silent.

### `agent-os/specs/2026-08-23-2313-one-budget/`

- **Relationship:** Extends.
- **Relevant decisions:** D7 — income is not budgeted, it is the thing being budgeted, which is
  why the Income section exports `Envelope` / `Activity` and no Assigned or Available. D8 — the
  two forecast panels are collapsed-by-default reference, carried over from the retired
  Commitments page; they are in the export because they are part of the month's picture even
  when closed.

### `agent-os/specs/2026-08-26-2159-grid-aggregation-placement/`

- **Relationship:** Extends.
- **Relevant decisions:** D4 — the page keeps exactly one full-width combined footer, the
  figure that has to be believed, with per-section subtotals above their own grid. The export
  mirrors that: each table section carries its own subtotal caption, and the combined Spending
  total appears once, in Summary.

### `agent-os/specs/2026-08-13-1050-menu-completeness/`

- **Relationship:** Extends.
- **Relevant decisions:** File is the catalog and a declared family folds behind a submenu on
  every surface. `Export` and `Copy to Clipboard` are already in `NESTED_SECTIONS`; a fourth
  member changes nothing about the fold.

## Similar implementations

### The per-grid exporter

- **Location:** `src/lib/grid/exportCsv.ts`; registration in
  `src/components/grid/DataGrid.tsx:758-855`.
- **Relevance:** This is the code being generalised. `exportableColumns` / `exportCellText`
  decide what a cell says; `tableToCsv` / `tableToRecords` / `parseDepthForest` render a table;
  `gridExportCommands` / `gridCopyCommands` build the menu.
- **Key patterns:** The command list is built once with an empty memo and reads `columns` /
  `displayRows` from an `exportSnapshot` ref — putting them in the deps re-registered every
  frame and tripped `useRegisterCommands`' churn guard with "Maximum update depth" on Finances.
  `BudgetView` must copy that shape, not the naive one.
- **What differs:** `BudgetView` assembles seven sections instead of one table, and its
  snapshot is the whole document rather than one grid's columns and rows.

### The scoping being deleted

- **Location:** `src/lib/finances/budget/gridScopes.ts`, `src/lib/commands/scope.ts`.
- **Relevance:** `budgetGridExportPlan` is the workaround this spec removes. `scopeCommand` /
  `scopedFormatLabel` stay — `GridToolbar` uses the former for its own dual-grid case, and it
  uses the latter internally for `alternate` labels.
- **What differs:** After this change nothing passes `commandScope` to a `DataGrid`, so those
  props and the `scopedExportCommands` memo go with it.

### The full-result export loader

- **Location:** `loadExportRows` in `src/components/finances/useRegisterSource.ts:286`, wired at
  `FinancesView.tsx:319`.
- **Relevance:** The precedent for exporting something other than the mounted viewport. Budget
  does not need it — every envelope of the month is already in `data.categories` — so the
  Budget document reads the rendered rows directly.

## The page being exported

- `src/components/finances/budget/BudgetView.tsx` — `BudgetSummary` (Ready to Assign +
  `month.terms` + account pool), `IncomeSection` (line 1415), the three `BudgetSection` cards,
  `ForecastDetails`.
- `src/components/finances/budget/ForwardPanel.tsx` — `ExpectedVsIncome` and `ForwardPanel`,
  the two tables the last two sections mirror.
- `src/lib/finances/budget/envelope.ts` — `BudgetMonth.terms`, built beside the arithmetic
  "precisely so a page cannot render a breakdown that fails to add up to its own headline".
  The export gets the terms from there for the same reason.
- `src/lib/finances/commitments.ts` — `ForwardBucket` / `ForwardItem`.
- `src/lib/finances/expectedSpending.ts` — `SpendingVsIncome`.
