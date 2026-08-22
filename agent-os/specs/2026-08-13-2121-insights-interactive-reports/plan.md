# Finances insights — interactive reports

**Status: active**  
Spec folder: `agent-os/specs/2026-08-13-2121-insights-interactive-reports/`

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-12-2031-finances-insights-dashboard/` — same classified rows, same flow rules (transfers out of spend, baseline vs one-off, pay-period axis, coverage-gap disclosure), same `/finances/insights` route, same hand-rolled SVG panels. Those panels stay; this spec adds interactivity and new views on top of them.
- **Extends:** `agent-os/specs/2026-08-12-1048-finances-csv-import-register/` — sign rule (positive = money into the account), `numeric(14,2)` / integer cents, account identity, no second hierarchy.
- **Extends:** `agent-os/specs/2026-08-12-1356-capitalone-360-statement-import/` and `agent-os/specs/2026-08-12-1540-chase-statement-import/` — statement snapshots still feed carrying cost only.
- **Supersedes (insights spec, charts):** "Hand-rolled SVG, no new dependency." A chart library is now allowed for **new** visualizations. Existing `CashFlowChart` / `CategoryBars` / `BalanceChart` are not rewritten onto it.
- **Supersedes (insights spec, palette):** "No categorical palette" **only** for stacked trends and Sankey, which cannot encode identity by rank. Ranked category/payee lists stay one hue. New `--chart-cat-N` tokens; do not reuse `--priority-*` or `--type-*`.
- **Does not supersede:** ranked bars as the default category encoding; envelopes deferred; no Plaid; no holdings; no forecasting; the coverage gap stays a UI element; classification still does not change `amount`.

## Context

The insights dashboard shipped 2026-08-13 and made the 3-year import honest: transfers paired, spend reported as −$147,362 instead of −$493,642, pay-period axis, baseline vs one-off, ranked category bars, recurring bills, cash-minus-cards, carrying cost. What it cannot do is the thing every comparable finance app treats as table stakes: **click a number and see the rows**.

Quicken, Monarch, Empower, and YNAB all share one interaction model — time-series + categorical breakdown + filters + drill-down to transactions — and a few standout views (Monarch Sankey, Quicken assets-vs-debt, YNAB spending trends). This spec takes that interaction model and the views that our **existing classified history** can support.

It is a visualization delta, not a data-model spec. Roadmap § Financial planning still has **envelopes next**, then goals, then Plaid. Achieve had no finance module.

## Decisions

| Topic                                        | Choice                                                                                                                                                                                                                                                                                                       |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Scope                                        | Interactive reports over existing classified rows. No new tables.                                                                                                                                                                                                                                            |
| Drill-down                                   | On-page transaction list that follows the current filter + click. Not a DataGrid. Not a navigation away.                                                                                                                                                                                                     |
| Shared filters                               | Multi-select account / category / merchant. Empty = all (not none). Same row set feeds every panel.                                                                                                                                                                                                          |
| Time windows                                 | Keep 6m / 12m / 24m / all; add **3m, YTD, QTD**. YTD/QTD year and quarter from `localDateKey()` (wall-clock today). Trailing windows still end on the last imported day.                                                                                                                                     |
| Existing charts                              | Keep the SVG cash-flow, ranked category bars, and balance charts. Add click-to-drill and tap tooltips.                                                                                                                                                                                                       |
| New charts                                   | Spending trends (stacked/grouped bars by category over time), top payees (ranked bars), Sankey (income sources → spent/kept → categories), richer cash-vs-card-debt.                                                                                                                                         |
| Chart library                                | **Recharts** for new Cartesian charts. **`d3-sankey`** for Sankey layout only, drawn in house SVG so it matches the existing panels. Do not pull all of D3. Do not adopt Nivo.                                                                                                                               |
| Category encoding                            | Ranked bars remain the default for "where it went" and top payees. No pie, no donut, no treemap in this spec.                                                                                                                                                                                                |
| Categorical color                            | Dedicated `--chart-cat-1`…`--chart-cat-8` tokens for stacked trends and Sankey only. Light + dark.                                                                                                                                                                                                           |
| Sankey model                                 | One period's totals, not claimed money-movement. Left = income sources (effective merchant of `income` rows). Middle = **Spent** and **Kept** (or **From savings** when net is negative) so widths balance. Right = spend categories. Optional grouping adds merchants under categories. Transfers excluded. |
| Cash vs debt                                 | Among **imported** accounts only. Assets = checking/savings/cash/investment; debt = credit_card/loan. Still **not net worth**. Debt-to-asset % and expandable per-account contribution in the window.                                                                                                        |
| Persistence                                  | Extend the existing `insights` setting with filters and last drill. No named saved reports.                                                                                                                                                                                                                  |
| Envelopes / budgets / projections / holdings | Out. Envelopes remain the next Finances spec.                                                                                                                                                                                                                                                                |
| Open in register                             | A local "see in register" control on the audit list is fine if cheap. Do not invent a URL filter protocol unless the register already accepts one.                                                                                                                                                           |

## Acceptance criteria

- [ ] Clicking a category bar, payee bar, cash-flow bucket, trend segment, Sankey node/link, or account in the cash-vs-debt panel updates the on-page transaction list to exactly the rows that produced that figure, in the current window and filters.
- [ ] Account / category / merchant multi-filters recompute **every** panel from one filtered row set. Empty selection means all.
- [ ] Internal transfers stay out of spend, income, Sankey, trends, and payees under every filter and drill. Refunds still net off the category they returned to.
- [ ] Window presets include 3 months, QTD, and YTD, computed from local today. Existing 6m / 12m / 24m / all and the month vs pay-period axis still work, including the trailing-12 overlay (still computed from the whole history, then sliced).
- [ ] Spending trends show the top categories (+ Other) as stacked bars over the current axis, with a grouped toggle. Click a segment drills. A dashed red line marks typical income for one bucket (the same monthly figure as the tile; restated per paycheck on the pay-period axis). Zero income hides the line.
- [ ] Top payees is a ranked bar list (same encoding as "Where it went"), largest first, click drills.
- [ ] Sankey shows income sources → Spent/Kept (or From savings) → categories for the window; hover gives amount and share; click drills. Thickness ∝ amount.
- [ ] Cash-vs-debt shows asset and card-debt series (or bars + overlay) for imported accounts, a debt-to-asset percentage, and per-account contribution. Copy still says this is not net worth.
- [ ] Existing panels remain: stat tiles, cash flow (in-out / net / bills-vs-rest + level bills), ranked categories, baseline vs one-off, recurring, one-off review, carrying cost, coverage gap, Reclassify.
- [ ] Ranked category/payee lists stay one hue. Stacked trends and Sankey use only the new `--chart-cat-*` tokens.
- [ ] No schema migration. Classification still does not change any account's `sum(amount)`.
- [ ] A second user cannot read the first user's rows through any new query. New queries registered in `crossUserReads.integration.test.ts`.
- [ ] Pure analytics (filter, drill, trends, payees, Sankey aggregation, assets-vs-debt) live in `src/lib/finances/**` with `*.test.ts` beside them. No React component tests.
- [ ] Charts have hover **and** tap tooltips. Filter controls are 44px on compact.
- [ ] `npm run test:unit` passes. After any query change, integration tests actually ran (no skip warning). After touching `src/app/**`, `npm run smoke` against the running dev server.

## Changes from original plan

Material refinements during implementation (requirements, design, scope). Omit pure code polish.

| #   | Change                                                                                                                                                                                                  | Why                                                                                                                                                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Replaced `BalanceChart` with the assets-vs-debt panel rather than keeping both.                                                                                                                         | One reconstructed running total already said "not net worth"; a second line of the same sum next to the split would have been two answers to one question. |
| 2   | Debt is a non-negative magnitude. A reconstructed card _credit_ (payments that outran imported purchases because the feed did not start at zero) sits with assets, so debt-to-asset cannot go negative. | The first render showed −$788 of "debt" and −35%. That is a missing opening balance, not a surplus of borrowing.                                           |
| 3   | Clicking **Other** on spending trends drills the leftover categories, not a literal category named Other.                                                                                               | Other is a fold, not a taxonomy member.                                                                                                                    |
| 4   | A spending-trend segment drills the category, not the bucket.                                                                                                                                           | The question the stack answers is "which category", matching the ranked bars.                                                                              |
| 5   | Spending trends overlay typical income as a dashed red (`--chart-spend`) reference line, restated per pay period when that axis is on.                                                                  | The comparison the stacked bars ask is "did this bucket spend more than I typically earn"; a monthly line on two-week bars would answer a different one.   |

## Out of scope

- Envelopes, budgets, Graph Remaining / Graph Actual.
- True net worth, manual assets (house, car, retirement), Zillow, mortgage.
- Holdings, TWR, IRR, allocation, rebalancing, Monte Carlo.
- Projected cash flow / scheduled bills series.
- Plaid / live feeds, multi-currency.
- Pie, donut, treemap.
- Drag-and-drop customizable cards.
- Named saved reports / shareable reports.
- Tags, category groups/hierarchy (taxonomy stays the flat 20 + Uncategorized).
- Split transactions, AI classification, itemized receipts.
- Rewriting the existing SVG charts onto Recharts.
- Export / print.

## Tasks

1. **Save spec documentation** — this folder.
2. **Filter + drill model** — `insightsFilter.ts`.
3. **Persist view state** — extend `src/lib/settings/finances.ts`.
4. **Chart library + categorical tokens** — Recharts, d3-sankey, `--chart-cat-*`.
5. **Filter chrome + audit list + click-to-drill** on current panels.
6. **Spending trends** — stacked/grouped bars by category.
7. **Top payees** — ranked merchant bars.
8. **Sankey cash flow**.
9. **Richer cash vs card debt**.
10. **Verify, freeze spec, update roadmap.**

## Code map (intended)

| Concern                        | Where                                                             |
| ------------------------------ | ----------------------------------------------------------------- |
| Filter, window, drill          | `src/lib/finances/insightsFilter.ts`                              |
| New aggregations               | `src/lib/finances/analytics.ts`, `src/lib/finances/sankeyFlow.ts` |
| Dashboard read (`accountKind`) | `src/lib/finances/dashboardQueries.ts`                            |
| View state                     | `src/lib/settings/finances.ts`                                    |
| Panels                         | `src/components/finances/insights/`                               |
| Chart tokens                   | `src/app/globals.css`                                             |

While this spec is **active**, when we make a material change to requirements, design, or scope (including from feedback on what was implemented), update the relevant sections and append to **Changes from original plan**. Skip pure implementation details. Freeze when verified.
