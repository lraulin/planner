# References for Finance pages read what they use, not the ledger

## Governing specs

### `agent-os/specs/2026-08-24-1945-register-prepared-rows/`

- **Relationship:** Extends; supersedes two decisions.
- **Relevant decisions:** compact index plus 100-row blocks, virtualization, and the JS
  pipeline carry forward. "The server loads the user's ledger" now holds only for unbounded
  queries and the derived views (D8). The index no longer returns facets (D10). Change #1 —
  assignability is a whole-ledger fact carried as index metadata — stands; D9 changes how it
  is read.

### `agent-os/specs/2026-09-03-1307-register-date-presets/`

- **Relationship:** Supersedes D6 ("No SQL date window").
- **Relevant decisions:** the calendar bands, their inclusive bounds (D2, D4), This Month as
  the All Transactions default (D5) and the matching contract (D7) carry forward and are what
  `registerDateBound` reads. Unknown today matches everything, so it yields no bound.

### `agent-os/specs/2026-08-16-1338-finances-dashboard-available/`

- **Relationship:** Supersedes change #6 ("`loadDashboard` is one composed read").
- **Relevant decisions:** accounts via `listAccounts`, the shared pending selection, and
  connection freshness without the access URL all carry forward as separate reads (D2).

### `agent-os/specs/2026-08-12-2031-finances-insights-dashboard/`

- **Relationship:** Extends. Change #7 (whole history, windowed in the client) is reaffirmed.
- **Relevant decisions:** a trailing-12 average needs the twelve buckets before the first
  visible one. D5 adds the other whole-history dependencies a windowing spec must solve.

### `agent-os/specs/2026-09-06-1427-bill-anchor-retires/` and `2026-08-23-2313-one-budget/`

- **Relationship:** Extends.
- **Relevant decisions:** a bill's charges are what is filed to its envelope (D4 there), which
  is the whole basis of D3 here. The forecast panels (one-budget D8) stay.

### `agent-os/specs/2026-08-14-1012-recurring-bill-cadences/`

- **Relationship:** Extends. Change #4: a declared bill's amount reads the whole history, so
  the review read (D4 here) is narrowed by flow and sign, never by date.

### `agent-os/specs/2026-09-05-1642-bills-open-record/`

- **Relationship:** Extends. "Discover recurring charges" stays a page command; its count goes.

## Context, not governing

- `agent-os/specs/2026-10-12-2001-node-postgres-driver/` — active sibling. Removes a round
  trip per query; independent of this spec in both directions.
- `agent-os/specs/2026-10-13-1155-immediate-navigation-and-page-cache/` — active sibling,
  shaped the same hour. Client-side: immediate feedback and a per-route page cache (Accounts
  and Bills cached, Register never). Server render time is out of its scope and is this
  spec's whole subject. Shared files: the finance `page.tsx` files. D4's review action and
  D10's facets action are reads, so they add nothing to its list of actions that leave a
  cached tab stale.
- `agent-os/specs/2026-08-26-2022-split-transactions/` D2, D8 — money rows versus bank rows,
  and children reached through their parent. D6 changes how child totals are read, not which
  rows a register lists.
- `agent-os/specs/2026-09-05-0906-production-backup-recovery/` — where Task 2's backup comes
  from. `backup:restore-test` restores into a throwaway container, not the dev database.
- `docs/actual-budget/README.md` — read for D12. No concern in its table is touched.

## Similar implementations

### `loadPaydays` and `countedRows`

- **Location:** `src/lib/finances/dashboardQueries.ts`; commit `437ad77d`.
- **Relevance:** the pattern D1 generalises.
- **Key patterns:** the SQL predicate is argued from the pure function's own fallback; the
  row scope is shared with the full read; the integration test compares against
  `paydaysFrom(await loadInsightsRows(userId))` and seeds a row that is income only by
  override and one that is not income only by override.

### `lastChargeByEnvelope`

- **Location:** `src/lib/finances/billLastCharge.ts`.
- **Relevance:** an existing narrow read of rows filed to envelopes, on `moneyRows`.
- **Key patterns:** scoped by user, wrapped in `oncePerRequest` because three loaders want it.

### `budgetContributionSql`

- **Location:** `src/lib/finances/budget/contributionSql.ts`.
- **Relevance:** how a transfer partner is tested in SQL. Read it before D9; do **not** reuse
  it for assignability — it answers a different question (budget contribution) and D9 keeps
  `categoryAssignableIds` as the one definition.

### The code this changes

- `src/lib/finances/queries.ts` — `TRANSACTION_LIST_COLUMNS`, `listTransactions` (already
  takes `from` / `to`), `loadRegisterPrepared`, `loadRegisterBlock`.
- `src/lib/finances/registerQuery.ts` — `prepareRegister`, `annotateCategoryAssignability`,
  `RegisterIndex`.
- `src/lib/finances/categoryEligibility.ts` — `categoryAssignableIds`, the argument for D9's
  subset.
- `src/lib/grid/serverQuery.ts` — `passingRows`, the argument for D8's superset.
- `src/lib/finances/analytics.ts` — `spendCentsOf`, `chargesByMerchant`, `chargesByPayee`,
  `effectiveMerchant`, the arguments for D2 and D4.
- `src/components/finances/useRegisterSource.ts`, `FinancesView.tsx` — where the client's
  query key is built and compared (D7).
- `src/lib/agent/financeTools.ts` — the five `loadDashboard` callers.
