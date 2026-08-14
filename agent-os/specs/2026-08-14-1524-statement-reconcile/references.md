# References for Statement reconcile + sanity checks

## Governing specs

### `agent-os/specs/2026-08-12-1048-finances-csv-import-register/`

- **Relationship:** Extends
- **Relevant decisions:** positive = money in; insert-or-skip; fingerprint + occurrence
  ordinal; displayed balance was `SUM(amount)` (this spec keeps that as the ledger and
  changes only the headline). Do not invent spend.

### `agent-os/specs/2026-08-12-1540-chase-statement-import/`

- **Relationship:** Extends; supersedes “no statements page”
- **Relevant decisions:** `finance_statements` are official bookends. Schema comment:
  “the bookend a later reconcile compares the register against.” Follow-up named this
  UI. Insert-or-skip statements. Opening/closing use the module sign.

### `agent-os/specs/2026-08-14-1430-capitalone-card-statements/`

- **Relationship:** Extends; same “no statements page” supersession
- **Relevant decisions:** 67 PDFs, 65 unique cycles, **2025 PDFs missing**. CSV from
  2025-08-10. That hole is the leading live-data suspect.

### `agent-os/specs/2026-08-12-2031-finances-insights-dashboard/`

- **Relationship:** Extends; supersedes “reconcile is out of scope” and late-start-only
  `coverageGap`
- **Relevant decisions:** coverage is a UI element; classification never changes
  `amount`; `reclassify` must leave every account’s sum byte-identical.

### `agent-os/specs/2026-08-14-1208-finance-agent-tools/`

- **Relationship:** Extends
- **Relevant decisions:** agent numbers = dashboard numbers; integer cents; no raw
  dumps except paginated search. This spec adds `list_statements` on the same terms
  and extends `get_finance_overview`.

### `agent-os/specs/2026-08-13-0747-module-pages/`

- **Relationship:** Extends
- **Relevant decisions:** Finances pages live in `src/lib/navigation/pages.ts`. A
  third (now fourth) page is a built destination, not a setting.

### `agent-os/specs/2026-08-13-2121-insights-interactive-reports/`

- **Relationship:** Does not supersede (still active)
- **Relevant decisions:** new charts stay. This spec only updates the existing
  coverage panel and current-balance figures.

## Similar implementations

### Statement query (no UI)

- **Location:** `src/lib/finances/queries.ts` (`listStatements`)
- **Relevance:** already returns every snapshot field the page needs
- **Key patterns:** `userId` on both sides of the join; cents via `numericStringToCents`

### Account balances

- **Location:** `src/lib/finances/queries.ts` (`listAccounts`);
  `src/components/finances/FinancesView.tsx` (`AccountBalances`)
- **Relevance:** SQL `sum(amount)` is today’s headline; this spec adds the newest
  statement and a post-statement sum in SQL, not JS

### Coverage gap

- **Location:** `src/lib/finances/analytics.ts` (`coverageGap`)
- **Relevance:** late-start detection and unpaired-leg unitemized dollars. Rewrite
  to include mid-history holes and balance mismatches.

### Carrying cost / latest close

- **Location:** `src/lib/finances/dashboardQueries.ts` (`loadCarryingCost`)
- **Relevance:** already reads `latestClosingBalanceCents` and ignores it for display

### Orders page

- **Location:** `src/app/finances/orders/page.tsx`,
  `src/components/amazon/AmazonOrdersView.tsx`
- **Relevance:** sibling “imported source data” Finances page — thin route, DataGrid,
  no inventing ledger spend

### Module pages registry

- **Location:** `src/lib/navigation/pages.ts`
- **Relevance:** add `statements` between `register` and `insights`
