# References for Commitments

## Governing specs

### `agent-os/specs/2026-08-14-1012-recurring-bill-cadences/`

- **Relationship:** Extends, and **supersedes its identity decision only**.
- **What changes:** `unique (user_id, merchant)`. That column was serving as display name,
  unique key and transaction join at once, which is the direct cause of the 1Password rename
  being impossible and of Pizza Hut / Domino's being unable to share an entry.
- **What carries forward, unchanged:** `cadence_months` in _months, not days_ (semi-annual
  is a calendar fact, and a 182-day cadence drifts a fortnight per decade); detection
  **proposes and never applies**; declaring a bill suppresses it from the one-off review
  list permanently and independently of the current window; the `Level bills` accrual and
  its labelling.
- **Key patterns to borrow:** `recurringBills.ts` is the model for this work's new lib
  modules — pure, `YYYY-MM-DD` keys throughout, no `Date` for calendar math, deliberately
  free of any import from `analytics.ts` so the dependency runs one way.

### `agent-os/specs/2026-08-14-1104-unscheduled-bills/`

- **Relationship:** Extends. Nothing here changes.
- **Relevant decisions:** `scheduled` and `set_aside` are **orthogonal** — one says whether
  the _date_ is knowable, the other whether the _cost_ accrues. Propane is unscheduled and a
  perfectly good set-aside. An unscheduled bill gets **no forecast row**, because a projected
  date reads as knowledge however it is captioned; Task 7's forward view inherits that rule.
- **Also inherited:** the refusal to infer an ongoing bill from a name appearing twice. A vet
  bill is not propane. Tier 2 entries are created by the user, never auto-declared.

### `agent-os/specs/2026-08-16-1338-finances-dashboard-available/`

- **Relationship:** Extends, and **supersedes its scoping of set-asides to declared bills**,
  extending the same deduction to Tier 2.
- **Relevant decisions that carry forward:** available = spendable cash − card debt −
  set-asides; savings excluded and shown separately; the figure is **not clamped at zero**,
  because clamping restores the comfort the page exists to remove; pending added only onto a
  synced balance; sign convention positive-is-inflow, so no `Math.abs` or unary minus belongs
  in this arithmetic.
- **Key pattern:** `available.ts` is pure, imports no database, and takes `todayKey` from the
  caller. `recurringSpendHeld()` must hold that line.

### `agent-os/specs/2026-08-12-2031-finances-insights-dashboard/`

- **Relationship:** Extends.
- **Relevant decisions:** merchant normalization (`WM SUPERCENTER #1981` and `WAL-MART #1981`
  are one store); the baseline / lumpy separation that D7 must not disturb; subscription
  detection by **variance alone**, without categories.

## Similar implementations

### Cadence arithmetic — `src/lib/finances/recurringBills.ts`

- **Relevance:** Every date function Task 7's forward view needs already exists.
- **Reuse directly:** `shiftDateKeyMonths` (clamps into short months — Aug 31 + 6mo is Feb
  28, not Mar 3), `nextDueFrom` (walks a stale anchor forward rather than declaring a bill
  three cycles overdue), `annualCents`, `cadenceLabel`, `CADENCE_CHOICES`.

### Set-aside accrual — `src/lib/finances/available.ts:301` `setAsideHeld`

- **Relevance:** The Tier 1 half of the arithmetic, unchanged by this work, and the reason
  D1 concluded two tables are safe — it takes a plain `StoredBill` shape, not a table row.
- **Key pattern to preserve:** the accrual is anchored on the **last posted charge**, so it
  resets when a charge posts and nothing has to notice. `heldCents = min(expected, perPaycheck
× accrued)`.
- **Why D6 needs a second function:** this one accrues _toward_ a charge and assumes cadence
  ≥ pay period; a weekly rate against biweekly pay inverts that.

### Merchant identity — `src/lib/finances/analytics.ts:112` `effectiveMerchant`

- **Relevance:** Produces the exact strings that go in `matchers[]`. The matcher index must
  be keyed on its output, not on raw `description`.
- **Related:** `effectiveCategory` / `effectiveFlow` above it show the house pattern for a
  resolution chain with an honest fallback.

### Declared-bill consumers to migrate off `merchant`

`src/lib/finances/dashboardQueries.ts:182` (the `declared` Set), `analytics.ts`,
`insightsAnalysis.ts`, `available.ts`, `mutations.ts:449` (`upsertRecurringBill`),
`src/app/finances/actions.ts`, and the three insights components `RecurringTable.tsx`,
`OneOffReview.tsx`, `UpcomingBills.tsx`.

### Agent write tools — `src/lib/agent/contracts.ts:505`

- **Relevance:** `create_node` / `update_node` / `create_metric` / `update_metric` are the
  established shape for a write tool: strict input schema, `retryableObject()` for creates,
  a paired output schema, handler in a per-domain `*Tools.ts`.
- **Note:** `financeTools.ts` exists but is entirely read-only today (`get_finance_overview`
  at `contracts.ts:623` and neighbours). Task 9 adds the first finance writes, so the
  cross-user integration coverage matters more here than usual.

### Grid and navigation

- `src/lib/navigation/pages.ts:233` — the Finances page registry; `dashboard` currently holds
  `isDefault: true` and the registry permits exactly one, asserted by `pages.test.ts`.
- `src/components/finances/insights/RecurringTable.tsx` — the hand-rolled table the
  Commitments page **replaces** with the shared `DataGrid`. Useful as a record of the
  editing affordances that exist today (cadence select, set-aside checkbox, unscheduled
  amount input) and of the three that were missing (name, amount on a scheduled bill, next
  due date).
