# References — Finances insights interactive reports

## Governing specs

### `agent-os/specs/2026-08-12-2031-finances-insights-dashboard/`

- **Relationship:** Extends. Supersedes its "hand-rolled SVG, no new dependency" decision
  for _new_ charts, and its "no categorical palette" decision only for stacked trends and
  Sankey.
- **Carries forward:** derived vs override, transfer pairing, pay-period axis, trailing-12
  overlay, baseline vs one-off, ranked category bars as the default encoding, coverage-gap
  disclosure, integer cents, client-side windowing so the trailing average is real at the
  left edge, the `insights` setting scope.
- **Still deferred:** envelopes, AI classification, itemized receipts, Plaid.

### `agent-os/specs/2026-08-12-1048-finances-csv-import-register/`

- **Relationship:** Extends.
- **Carries forward:** sign rule, account identity, `finance_account_kind`, no second
  hierarchy.

### `agent-os/specs/2026-08-12-1356-capitalone-360-statement-import/` and `agent-os/specs/2026-08-12-1540-chase-statement-import/`

- **Relationship:** Extends. Unchanged consumer: the carrying-cost panel.

## Similar implementations

### Chart math and existing panels

- **`src/lib/metrics/derive.ts`** — `niceTicks`, `bandSlots`, `barRect`, `areaPolygon`.
  Existing SVG charts keep using these.
- **`src/components/metrics/MetricChart.tsx`** — house charting pattern the SVG panels
  already copied.
- **`src/components/finances/insights/`** — `InsightsView`, `CashFlowChart`,
  `CategoryBars`, `BalanceChart`, `Panel`. Click-to-drill extends these; do not rewrite.

### Analytics and queries

- **`src/lib/finances/analytics.ts`** — `spendByCategory`, `cashFlow`, `balanceSeries`,
  `spendCentsOf` / `incomeCentsOf` / `effectiveFlow`. New aggregations must go through the
  same spend/income rules.
- **`src/lib/finances/dashboardQueries.ts`** — one read of the whole history. Add
  `accountKind` to that select; do not add a second query per panel.
- **`src/lib/finances/classify/categories.ts`** — flat 20-item taxonomy + Uncategorized.
  No groups.

### Settings

- **`src/lib/settings/finances.ts`** — window / axis / mode / levelRecurring. Extend this
  object; do not invent a second scope.
- **`src/lib/settings/parse.ts`** — `asOneOf`, `asStringArray`. Note: an empty array in
  the parser means "honour empty." For insights filters, empty means _all_ — document that
  at the type, because it is the opposite of the checkbox convention in the parser header.

### Competitive notes (no local visuals)

Quicken Simplifi/Classic, Monarch Money, Empower Personal Dashboard, YNAB Reflect — as
described in the shaping request. No screenshots were provided.
