# References for Commitments — say what it does

## Governing specs

### `agent-os/specs/2026-08-16-1938-commitments/`

- **Relationship:** Extends. Supersedes the `setAside` opt-in on both tiers, and the review
  list's commit-on-click behaviour.
- **Carries forward unchanged:** two tables with one shared arithmetic module (D1); the
  `name` / `matchers` split (D2); cross-table merchant exclusivity (D3); auto-derived,
  pinnable tier-2 amounts (D5); the `Σ max(0, rate − spent)` held formula (D6); tier 2 not
  touching the Insights baseline (D7); dead-subscription detection flagging rather than
  applying (D8); one page, two grids (D10); the File/View catalog (D11).
- **Changed:** D9's `active | cancelled | ignored` keeps all three values, but `ignored` is
  labelled **Dismissed** in the UI and such rows leave the bills grid. D0's three-tier model is
  untouched — this spec adds no buckets.
- **Worth re-reading before implementing:** its shaping notes open with the
  `1PASSWORDTORONTOON / Yearly / $38.03` complaint, which is the direct evidence for D3 here.
  The whole review-list editor exists because that complaint was fixed in the schema and never
  in the flow that creates rows.

### `agent-os/specs/2026-08-16-1338-finances-dashboard-available/`

- **Relationship:** Neither extends nor supersedes; it owns Available to Spend, which is what
  the accrual feeds.
- **Relevance:** The Dashboard's presentation of `SetAside` / `SpendHeld` is the model the
  Commitments grid is being brought into line with. Check before changing any wording there.

## Code references

### The arithmetic — do not change it

- **`src/lib/finances/available.ts`** — `setAsideHeld` (bills, accrues _toward_ a charge,
  resets on the posted charge) and `recurringSpendHeld` (spend, `max(0, rate − spent)` per
  period). Each loses exactly one guard clause in Task 2. `paydaysPerCadence` is why a yearly
  bill spreads over 26 paychecks, which is the behaviour this spec exists to make visible.

### The honest presentation to copy

- **`src/components/finances/dashboard/DashboardView.tsx`** — the "Bills" and "This period"
  panels already render the accrual correctly: _"$2.77 per paycheck of $71.88 · due Mar 30"_
  and _"$45.00 / $60.00 this period · over by $12.00"_. Task 3 is largely a matter of getting
  the same facts into a grid cell. The "N of M active bills are set aside" footnote is the one
  line here that Task 6 removes.

### The surfaces being changed

- **`src/components/finances/commitments/commitmentColumns.tsx`** — `billColumns` and
  `spendColumns`. The `hold` column and the `monthly` ("Set aside") column both go; the spend
  `name` column becomes an editable input matching the bills one directly above it.
- **`src/components/finances/commitments/CommitmentsView.tsx`** — `billRows` / `spendRows`
  derivation, where `monthlySetAsideCents` (`annualCost / 12`) is computed and where the real
  accrual calls belong instead.
- **`src/components/finances/commitments/ReviewList.tsx`** — three buttons that write
  immediately; two of them gain an in-place editor.

### Patterns to reuse

- **`renameRecurringBill`** in `src/lib/finances/mutations.ts` — the exact template for
  `renameRecurringSpend`, including the comment explaining why insert-then-delete would trip
  matcher exclusivity.
- **`checkedMatchers`** in the same file — the cross-table exclusivity gate. "Add to an existing
  group" only ever passes unclaimed merchants through it, which is what keeps that path from
  throwing `MerchantClaimedError`.
- **`NewSpendForm` / `NewBillForm`** in `CommitmentsView.tsx` — the field set and commit shape
  the review-row editor should mirror. Reuse the shape, not the component: the form is a
  blank-slate create, the editor is a pre-filled proposal, and merging them would produce a
  component with two modes and no clear owner.
- **`useToday`** (`src/components/grid/useToday.ts`) — how `todayKey` reaches this page from the
  browser rather than the server region.
