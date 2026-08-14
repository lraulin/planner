# References for Statement-anchored cash flow

## Governing specs

### `agent-os/specs/2026-08-14-1524-statement-reconcile/`

- **Relationship:** Extends; supersedes “historical series stay transaction-only”
- **Relevant decisions:** headline = latest close + later txs; holes are first-class;
  do not rewrite `amount`

### `agent-os/specs/2026-08-12-2031-finances-insights-dashboard/`

- **Relationship:** Extends
- **Relevant decisions:** `cashFlow()` over full history then slice; trailing-12;
  hand-rolled SVG; transfers out of spend

### `agent-os/specs/2026-08-14-1208-finance-agent-tools/`

- **Relationship:** Extends
- **Relevant decisions:** one composition; integer cents; extend `get_cash_flow`

## Similar implementations

### `cashFlow` / `monthBuckets`

- **Location:** `src/lib/finances/analytics.ts`
- **Relevance:** bucket `endKey` is already month-end; trailing computed on full series

### `reconcileAccounts`

- **Location:** `src/lib/finances/reconcile.ts`
- **Relevance:** same “close + later txs” rule, but for _now_; this spec applies it
  at every bucket end

### `CashFlowChart`

- **Location:** `src/components/finances/insights/CashFlowChart.tsx`
- **Relevance:** one y-axis; trailing line already exists — statement net is a second
  line of the same kind
