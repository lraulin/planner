# References for Register calendar date presets

## Governing specs

### `agent-os/specs/2026-08-04-1745-filter-control-per-kind/`

- **Relationship:** Extends the band-funnel model. Supersedes only “every date column shares `DATE_PRESETS`.”
- **Relevant decisions:** Named bands, one at a time; `(All)` to clear; Custom for anything finer; `presetOptions(kind)` is the family switch; checklist never sits on a date column.

### `agent-os/specs/2026-08-02-1208-custom-column-filters/`

- **Relationship:** Extends. Custom stays the escape hatch (a named past month, future-dated rows, blanks).
- **Relevant decisions:** Custom and presets are mutually exclusive per column; date operands compare as `YYYY-MM-DD`.

### `agent-os/specs/2026-08-05-0100-views-as-settings/`

- **Relationship:** Extends. This Month is All Transactions’ default filter, visible as a chip, restored by Reset this grid.
- **Relevant decisions:** `null` filters follow defaults; `{}` is Clear all; named views store their own filter map. All Transactions reseeding Date is Register-specific and does not change that contract for other tabs.

### `agent-os/specs/2026-08-24-1945-register-prepared-rows/`

- **Relationship:** Extends. Date bands still run inside `prepareRegister`. Does **not** supersede “the whole ledger loads; the index is compact.”
- **Relevant decisions:** Server-prepared index + 100-row blocks; no numbered pagination; search/filter/group stay shared grid semantics.

### `agent-os/specs/2026-08-28-1356-budget-activity-register-links/`

- **Relationship:** Extends. Activity Date is custom `gte`/`lte` for the linked month, not a relative band.
- **Relevant decisions:** URL-only view; chips explain it; `viewRows` is the hard contributing set. A relative “This Month” would be wrong when the Budget month is not today.

### `agent-os/specs/2026-08-12-1048-finances-csv-import-register/`

- **Relationship:** Extends as module ground. Achieve had no finance module — no deadline-fidelity obligation on Register Date.

## Similar implementations

### Deadline date presets

- **Location:** `src/lib/grid/filters.ts` (`DATE_PRESETS`, `matchesDeadline`, `presetOptions`, `shiftDays`)
- **Relevance:** The family this spec does _not_ extend. Copy the exclusive-band + unknown-today contracts; do not add month windows onto this list.
- **Key patterns:** `today === null` matches everything; blanks are explicit `(None)` / `(Has Date)` on deadlines and must fail calendar bands.

### Register query pipeline

- **Location:** `src/lib/finances/registerQuery.ts`, `src/lib/finances/registerFields.ts`, `src/app/finances/register/page.tsx`, `src/components/finances/FinancesView.tsx` (`viewDefaults`)
- **Relevance:** Where Date `filterKind` is declared, where the initial RSC query is built, and where All Transactions defaults live.
- **Key patterns:** `registerFields.date.filterValue` is `transactionDate`; `viewDefaults` already special-cases uncategorized and activity filters; first paint does not read `searchParams`.

### Activity month chips

- **Location:** `src/lib/finances/registerActivity.ts` (`activityViewFilters`, `monthEndKey`)
- **Relevance:** Proof that a specific calendar month is already expressed as custom `gte`/`lte`. Calendar kind must keep those operators.

### Budget month keys

- **Location:** `src/lib/finances/budget/envelope.ts` (`monthKeyOf`, `monthEndKey`, `shiftMonthKey`)
- **Relevance:** This Month / Last Month / This Year must use these, not a second month calculator.

## Actual Budget

- `docs/actual-budget/README.md` — semantics transfer, machinery does not.
- `../actual/packages/desktop-client/src/components/reports/ReportOptions.ts` — This month / Last month / Last 30 days / This year as named live ranges (report picker, not a register column funnel).
- `../actual/packages/desktop-client/src/components/reports/getLiveRange.ts` — Last 30 days is today−29 through today (inclusive), which is the rolling-window rule this spec copies.
