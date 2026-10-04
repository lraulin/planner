# References for Scenarios

## Governing specs

### `agent-os/specs/2026-08-26-0910-supplies-worksheet/`

- **Relationship:** Extends, and supersedes one half of D3.
- **Carries forward:** a standalone finance surface owns its tables and reads the budget
  without writing it; cost derives from one cost-per-day; a group and its funding envelope
  are separate fields.
- **Superseded:** that a group is free text on the item. It becomes a row.
- **Later spec on the same tables:** `2026-08-27-0958-supplies-merge-and-restock/`. Its
  merge keeps the survivor's group and names the groups being dropped in the preview. That
  behaviour carries forward unchanged; `merge.ts` reads a group id where it read a label.

### `agent-os/specs/2026-09-05-1200-finances-envelope-workflow/`

- **Relationship:** Extends.
- **Relevant decisions:** `incomeRole` and `expectedMonthlyIncomeCents` on income
  envelopes; an unset expectation is unknown, not zero; cost-of-living reports use
  completed months and keep the partial month apart.

### `agent-os/specs/2026-08-21-1403-commitments-expected-vs-income/`

- **Relationship:** Extends.
- **Relevant decisions:** D1, a bill's comparable figure is `annual ÷ 12`, never the
  accrual slice. D2, only active rows count toward a total.

### `agent-os/specs/2026-08-23-2313-one-budget/`

- **Relationship:** Extends.
- **Relevant decisions:** bills are rows on `finance_budget_categories` with
  `kind = 'bill'`, so an override keyed by envelope id serves bills and income alike.

### `agent-os/specs/2026-08-21-2038-paused-bills-assignment/`

- **Relationship:** Extends.
- **Relevant decisions:** paused holds nothing without being cancelled. It was introduced
  for the house move, which is the case a scenario switches back on.

### `agent-os/specs/2026-08-27-0757-currency-expression-entry/`

- **Relationship:** Extends.
- **Relevant decisions:** money cells go through `parseAmountEntryCents`; blank or
  unparseable input reverts and writes nothing.

### `agent-os/specs/2026-08-13-0747-module-pages/`

- **Relationship:** Extends.
- **Relevant decisions:** one registry entry per page; the shell owns the page bar.

## Similar implementations

### Supplies page

- **Location:** `src/app/finances/supplies/page.tsx`, `src/components/finances/supplies/`,
  `src/lib/finances/supplies/`
- **Relevance:** the closest existing surface: standalone tables, a tree in `DataGrid`,
  group totals in the columns, read-only use of envelopes.
- **Borrow:** the `queries` / `mutations` / `rows` / pure-math split and its test layout;
  `supplyGroups` and `cost.ts` for a line's Supplies amount.

### Bills page and its forecast

- **Location:** `src/app/finances/bills/page.tsx`, `src/lib/finances/billsView.ts`,
  `src/lib/finances/commitmentRows.ts`, `loadBillForecast` in
  `src/lib/finances/dashboardQueries.ts`
- **Relevance:** the source of the live bill rows and of the remainder a new scenario must
  equal.
- **Borrow:** `billRows`, `activeBillTotals`, `billGroupLabel`, `billsGridRows`.

### Income plan

- **Location:** `src/lib/finances/budget/incomePlan.ts`
- **Relevance:** `regularIncomePlan` is the existing definition of expected Regular income
  and of "incomplete".

### Cadence

- **Location:** `src/lib/finances/recurringBills.ts`,
  `src/components/finances/CadenceSelect.tsx`
- **Relevance:** `Cadence`, `CADENCE_CHOICES`, `annualCents`. A manual line reuses all
  three so a line and a bill annualize by the same function.

### Insights spending

- **Location:** `src/lib/finances/reports.ts`, `loadInsightsRows` in
  `src/lib/finances/dashboardQueries.ts`, `src/lib/finances/budget/hierarchy.ts`
- **Relevance:** the rows and rules behind "last 12 months" for a line.
- **Borrow:** `spendingContributions`, `completedMonthAverages`,
  `descendantEnvelopeIds`.

### Agent finance tools

- **Location:** `src/lib/agent/contracts.ts`, `src/lib/agent/financeTools.ts`,
  `src/lib/agent/mcp.test.ts`, `src/lib/agent/responseBudget.test.ts`
- **Relevance:** where `list_scenarios` and `get_scenario` are registered and bounded.

### Cross-user read registry

- **Location:** `src/lib/db/crossUserReads.integration.test.ts`
- **Relevance:** every new read is added here.
