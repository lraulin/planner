# References — month-ahead zero-based budget

**Status: frozen / complete** (2026-08-25)

## Governing specs

### `agent-os/specs/2026-08-22-1948-zero-based-budget/`

- **Relationship:** Extends the fold; supersedes D1 `buffered` / D7 Hold as Rule 4.
- **Relevant decisions:** Envelope math, integer cents, opening position. Hold was the first
  slice's Rule 4; this delta replaces it with assign-into-future-month.

### `agent-os/specs/2026-08-23-2313-one-budget/`

- **Relationship:** Extends; supersedes D4 only for monthly-bill sinking-when-not-due.
- **Relevant decisions:** Bill demand is intrinsic to cadence. Forecast panels are collapsed
  `<details>` (D8), which is where the pay-period column survived.

### `agent-os/specs/2026-08-24-1311-budget-assign-options/`

- **Relationship:** Extends. Underfunded still uses `demandOf`; D1 changes what a monthly
  bill returns.
- **Relevant decisions:** Assign clamped to Ready to Assign; the displayed RTA is what clamp
  should see after D3.

### `agent-os/specs/2026-08-24-2206-single-pool-budget/`

- **Relationship:** Extends. Current-month reconciliation stays; identity gains "assigned in
  future months." Historical months stay historical.

### `agent-os/specs/2026-08-21-1403-commitments-expected-vs-income/`

- **Relationship:** Supersedes D1/D3 pay-period column on Budget only.
- **Relevant decisions:** Monthly and annual comparable columns remain; pay period was
  `annual / 26`.

## Similar implementations

### Envelope fold

- **Location:** `src/lib/finances/budget/envelope.ts`
- **Relevance:** `fromLastMonth`, `buffered`, terms, current-month reconciliation. D3 is a
  post-pass on months `>= currentMonth`.

### Bill funding demand

- **Location:** `src/lib/finances/budget/templates/schedule.ts`
- **Relevance:** Actual pay-this-month vs sinking. D1 splits monthly `n = 1` off sinking.

### Hold operations

- **Location:** `src/lib/finances/budget/operations.ts` (`holdForNextMonth`, `releaseHold`)
- **Relevance:** Product Hold goes away; fold still understands `bufferedCents`.

### Forecast panels

- **Location:** `src/components/finances/budget/ForwardPanel.tsx`,
  `src/lib/finances/expectedSpending.ts`, `src/lib/finances/commitmentRows.ts`,
  `src/lib/finances/dashboardQueries.ts`
- **Relevance:** Pay period column and axis to delete.

### Actual Budget

- `packages/loot-core/src/server/budget/actions.ts` — `holdForNextMonth`
- `packages/loot-core/src/server/budget/schedule-template.ts` — monthly interval 1 vs sinking
- Recorded divergences: `docs/actual-budget/README.md`
