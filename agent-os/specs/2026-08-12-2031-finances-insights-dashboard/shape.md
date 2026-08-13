# Finances insights dashboard — shaping notes

**Status: active**

## Scope

A data-visualization dashboard over the imported finance history, plus the classification
layer required to make its numbers true.

**In scope**

- Classification data model on `finance_transactions` (derived + user-override columns).
- Merchant normalization, a category rules engine, transfer pairing, income detection.
- A `reclassify` action that backfills all history idempotently.
- Pay-period calendar derived from detected paychecks.
- Analytics: bucketing, trailing averages, baseline/one-off split, spend by category,
  recurring-merchant detection, outlier suggestion, net-worth series.
- A dashboard route with nine panels, hand-rolled SVG charts.
- Register integration for the new fields.

### Out of scope

- **Envelopes** — still deferred; they remain the next Finances spec.
- Budgets, targets, or forecasting beyond the trailing average.
- Splitting a transaction across categories.
- Reconciliation against statements (statements are read for interest/fees only).
- Auto-applying one-off exclusions without confirmation.
- Plaid / live feeds, multi-currency, goal linkage — unchanged from the founding spec.
- Editing the pre-2025-08 blind spot away by estimating the missing itemization. It is
  disclosed, not modelled.

## Decisions

Four were settled with the user during shaping:

1. **Time axis** — monthly with a trailing-12 overlay _and_ a pay-period toggle, rather than
   either alone. Monthly keeps bills and tax years aligned; pay-period gives the
   apples-to-apples comparison that monthly cannot. Normalized income is
   `median(paycheck) × 26 ÷ 12`.
2. **One-offs** — a manual flag _and_ named events _and_ auto-suggestion. Auto-detection
   alone was rejected because an annual insurance premium is a genuine recurring cost that
   statistics would misread every year; manual alone was rejected because 37 months of
   history is too much to comb by hand.
3. **Categories** — full rules engine with backfill, not bank categories alone. Bank
   categories alone would have left the 875 uncategorized 360-feed rows as the single
   largest slice on the chart — the biggest bar would have been a hole.
4. **Charts** — hand-rolled SVG, no new dependency, matching `MetricChart.tsx`.

Made while shaping the data model:

5. **Derived columns are stored, not computed per request.** Storing them lets the register
   grid sort, filter and group by category, and lets rollups happen in SQL. Recomputation is
   an explicit action, not a page load.
6. **Transfer pairing gets a group id, not a boolean.** A boolean cannot express which two
   rows are the same movement, and the pairing is what lets the dashboard drop both legs
   without dropping a legitimate same-amount purchase.
7. **Unpaired legs still classify.** The pre-2025-08 Capital One payments have no opposite
   leg in the data at all. Requiring a pair would have left $109k misclassified as spending.
8. **The coverage gap is a UI element.** A caveat that lives only in a spec file will not
   reach the person reading the chart two years from now.

## Context

- **Visuals:** none provided. Panel layout described in `plan.md`.
- **References:** see `references.md`.
- **Product alignment:** Roadmap § Financial planning, already partially delivered. This
  adds reporting, which the founding spec listed as out of scope. Envelopes stay next.
- **Achieve parity:** not applicable — Achieve had no finance module, so there is no
  reference behavior to match and no divergence to declare.

## Evidence base

Every quantitative claim in `plan.md` came from querying the live `planner-postgres`
database during shaping rather than from reading code:

- outflow totals and the transfer regex shortfall,
- the 115 `CAPITAL ONE MOBILE PMT` rows and their $109,248 pre-itemization total,
- the 2,844/2,845 uncategorized count and the 875 blank `sourceCategory` rows,
- the four low-variance subscriptions,
- the three-employer paycheck succession,
- the 2025-08-10 Capital One itemization boundary.

This matters for a later reader: the design is shaped around what the data actually looks
like, not around what a finance schema usually looks like.

## Standards applied

See `standards.md`. The load-bearing ones are `development/testing.md` (pure logic in
`src/lib/**` with tests beside it; a cross-user case for every mutation),
`database/migrations.md` (generated migrations, enum seeded complete),
`development/dates.md` (calendar days stay strings), and `components/data-grid.md` /
`components/responsive.md` for the dashboard surface.
