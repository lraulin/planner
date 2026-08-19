# References for Period result

## Governing specs

### `agent-os/specs/2026-08-16-1338-finances-dashboard-available/`

- **Relationship:** Extends.
- **Relevant decisions:** The sign convention (positive is money in, for every account
  kind — `kind` only ever chooses which accounts are in a sum). Savings excluded from
  spendable money and shown beside it as cash position. The headline allowed to go
  negative rather than clamped, because clamping restores the comfort the page exists to
  remove. All three carry forward unchanged; D3 is the same instinct applied backward.

### `agent-os/specs/2026-08-16-1938-commitments/`

- **Relationship:** Extends. Frozen 2026-08-18.
- **Relevant decisions:** Tier 1 subscriptions/bills and Tier 2 recurring spend both
  accrue _forward_ toward a charge with a known date. There is no Tier 3 and no
  per-category bucket, on purpose. This spec's D2 explains why a backward measure does not
  use that accrual at all, and the contrast is recorded there so the two are not later
  unified. Also the source of `periodIndex`'s fixed (non-rolling) period boundaries.

### `agent-os/specs/2026-08-12-2031-finances-insights-dashboard/`

- **Relationship:** Extends.
- **Relevant decisions:** Payday cadence detection, the `PayPeriod` type, and pay-period
  bucketing that removes the three-paycheck month. Consumed as-is; how a period is found
  does not change.

## Similar implementations

### Running per-account balances across buckets

- **Location:** `src/lib/finances/analytics.ts` — `assetDebtSeries`, with its `applyRow`
  helper and running `Map` seeded from every row before the first bucket start.
- **Relevance:** This is the ledger walk Task 2 needs, already written and tested.
- **Key patterns:** Seed the map from all pre-window rows, then fold each bucket's rows in
  turn and snapshot. Reuse `bucketRows`. Note that `assetDebtSeries` answers "what am I
  worth" over a different account set — `cashPosition` in `available.ts` deliberately keeps
  the two apart so a mortgage cannot swamp a figure about groceries. The new module follows
  `cashPosition`'s account selection, not `assetDebtSeries`'s.

### The forward-looking counterpart

- **Location:** `src/lib/finances/available.ts` — `availableToSpend`, `cashPosition`,
  `SPENDABLE_KINDS` / `SAVINGS_KINDS`.
- **Relevance:** The new figure is its backward twin and must use the same account
  selection so the two are comparable on the same page.
- **Key patterns:** Pure, no database import, no `new Date()`; `todayKey` from the caller.
  The module header's warning that a `Math.abs` or unary minus anywhere would be a bug
  applies equally to the new module.

### Editing a per-transaction flag

- **Location:** `src/lib/finances/mutations.ts:405` — the `excludeFromBaseline` +
  `eventLabel` edit.
- **Relevance:** Task 3's flag follows this exactly: `userId` first, ownership proved
  before writing, label trimmed.
- **Key patterns:** `if (edit.field !== undefined) values.field = ...` so an omitted field
  is left alone rather than cleared.

### Pay periods

- **Location:** `src/lib/finances/classify/payPeriods.ts` (`PayPeriod`, `PayPeriodRange`)
  and `analytics.ts` `payPeriodBuckets`.
- **Relevance:** Supplies the period boundaries the result is evaluated at.
- **Key patterns:** `paydays` is empty when a window was inferred across a gap or past the
  last real payday — which is precisely the case D6 must exclude from scoring.
