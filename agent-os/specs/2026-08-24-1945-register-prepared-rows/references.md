# References for Register prepared rows

## Governing specs

### `agent-os/specs/2026-08-12-1048-finances-csv-import-register/`

- **Relationship:** Extends the Register-on-DataGrid decision. Supersedes change #2 (whole ledger in the browser).
- **Relevant decisions:** Shared DataGrid, no numbered pager, persisted `grid:finances`.

### `agent-os/specs/2026-08-10-1940-daily-use-performance/`

- **Relationship:** Extends. This is the measured virtualization delta that spec left outside itself.
- **Relevant decisions:** Memoize rows first; do not replace the hand-rolled grid.

### `agent-os/standards/components/data-grid.md`

- **Relationship:** Supersedes the “virtualization / server-side sort-filter out until measured” table rows for the Register only. Pagination and AG Grid stay rejected.

## Similar implementations

### Actual Budget register

- **Location:** `../actual` (not vendored). Spreadsheet loads an index and pages transaction details.
- **Relevance:** Block-fetch of details behind a complete scrollable list, not numbered pages.

### Shared grid pipeline

- **Location:** `src/lib/grid/{filters,crossFilter,search,sortRows,distinct,collapse}.ts`
- **Relevance:** The server reuses these functions rather than a second matching language.

### Host grouping

- **Location:** `src/lib/finances/grouping.ts` `groupTransactions`
- **Relevance:** Register grouping stays host/server-side; DataGrid does not grow a second grouper.
