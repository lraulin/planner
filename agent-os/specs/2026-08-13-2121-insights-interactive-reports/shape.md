# Finances insights — interactive reports — shaping notes

**Status: active**

## Scope

Interactive reports over the classified finance history already on `/finances/insights`.
The frozen dashboard made the numbers honest; this spec makes them auditable and adds the
views that comparable apps treat as table stakes, using only data we already have.

**In scope**

- Shared account / category / merchant filters (empty = all).
- Time windows: 3m, YTD, QTD added to 6m / 12m / 24m / all.
- Click-to-drill from any chart to an on-page transaction list.
- Spending trends (stacked/grouped bars by category over the current axis), with typical income as a dashed red reference line.
- Top payees (ranked bars).
- Sankey: income sources → Spent/Kept (or From savings) → categories.
- Richer cash-vs-card-debt among imported accounts (still not net worth).
- Recharts for new Cartesian charts; `d3-sankey` for Sankey layout only.
- Persist filters + last drill on the existing `insights` setting.

### Out of scope

- Envelopes, budgets, Graph Remaining / Graph Actual.
- True net worth, manual assets, holdings, TWR/IRR, allocation, Monte Carlo.
- Projected cash flow / scheduled bills.
- Plaid, multi-currency, tags, category hierarchy.
- Pie, donut, treemap.
- Drag-and-drop cards, named saved reports, export/print.
- Rewriting existing SVG charts onto Recharts.
- AI classification, itemized receipts, split transactions.

## Decisions

Settled with the user during shaping:

1. **Slice** — interactive reports on existing data, not a Quicken-class suite. Drill-down,
   shared filters, trends, top payees, Sankey, richer cash-vs-debt, more time presets.
2. **Charts** — keep and improve the existing SVG panels. A chart library is allowed for
   new views; hand-rolled SVG was a recommendation of the previous spec, not a standing
   constraint. Ranked bars stay the default category encoding.
3. **Visuals** — none provided. Shape from the written competitive notes and the live
   dashboard.
4. **Governing set** — delta on `2026-08-12-2031-finances-insights-dashboard`. Envelopes
   stay deferred, not opened here.
5. **Product** — visualization delta. Envelopes remain Next on the Financial planning
   roadmap.

Made while writing the plan:

6. **Sankey is a period total, not money movement.** Income does not actually flow into
   categories. Spent/Kept (or From savings) is the residual that keeps widths honest.
7. **Empty filter = all**, unlike the settings-parser convention that honours an empty
   checkbox list as "show nothing." "Show me no accounts" is not a useful dashboard state.
8. **YTD/QTD take the year/quarter from wall-clock today**; trailing windows still end on
   the last imported day, matching the existing 6/12/24 month behaviour.
9. **No DataGrid** on the audit list. The register already is one; pairing a chart with a
   compact table is the competitive convention.
10. **Categorical palette is new tokens**, not a reuse of priority/type colours — same
    reason the income/spend/average tokens were invented.
11. **Spending trends income overlay** uses `--chart-spend` (dashed) rather than
    `--chart-income`, because the line is a spending ceiling: bars that cross it spent
    more than typical income. The amount is `typicalIncomePerBucketCents` — monthly
    income as-is, or × 12 ÷ 26 on the pay-period axis.

## Context

- **Visuals:** none.
- **References:** see `references.md`.
- **Product alignment:** Roadmap § Financial planning. Insights shipped; envelopes still
  next. This does not replace that item.
- **Achieve parity:** not applicable.

## Competitive sources (what we took, what we left)

Taken because the current data can support them:

- Quicken / Monarch / YNAB: click any segment → transaction list; shared time + account +
  category filters; income vs expense; spending breakdown.
- YNAB Reflect: spending trends as stacked bars by category over periods.
- Monarch: Sankey of the period's income vs spend (the standout differentiator).
- Quicken Net Worth: assets vs debt among what we have, debt-to-asset, account
  contribution — **without** calling it net worth.

Left because they need data or product we do not have:

- Empower allocation / TWR / Monte Carlo (no holdings).
- Quicken projected cash flow (no scheduled-bills series).
- YNAB budget remaining/actual (envelopes).
- Customizable drag-drop cards, saved named reports, pie/treemap.

## Standards Applied

See `standards.md`. Load-bearing: `development/testing.md` (pure analytics + tests beside),
`development/dates.md` (YTD/QTD from `localDateKey`), `development/security.md` (any new
query takes `userId`), `components/responsive.md` (hover and tap), `components/ux-principles.md`.
