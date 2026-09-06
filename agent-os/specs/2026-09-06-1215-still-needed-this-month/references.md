# References for Still needed this month

## Governing specs

### `agent-os/specs/2026-08-24-1311-budget-assign-options/`

- **Relationship:** Extends.
- **Relevant decisions:** `underfundedGapCents` and the Underfunded ranking
  (`compareUnderfunded`, D4 there: overspent → bills by due date → sinking targets by
  deadline → ordinary asks → deadline-free floors → the rest). Both are reused as-is; the
  ranking orders the rows in the new disclosure.

### `agent-os/specs/2026-08-28-1000-ynab-target-engine/` and `2026-08-28-2039-target-refill-basis/`

- **Relationship:** Extends.
- **Relevant decisions:** the demand math `neededAssigned` calls. `target-refill-basis` D3 —
  a deadline-free floor "asks this month, ranked after everything with a date on it" — is
  what puts Savings into the total, and therefore what D4 of this spec exists to make visible.

### `agent-os/specs/2026-08-25-1310-budget-funding-indicators/`

- **Relationship:** Extends.
- **Relevant decisions:** the per-row scan layer whose `moreNeededCents` this aggregates, and
  the amber `--goal-unmet` token for underfunded as distinct from red overspend (D6 here).

### `agent-os/specs/2026-08-29-2206-ready-to-assign-derivation/`

- **Relationship:** Extends.
- **Relevant decisions:** D2 — a derivation is typeset as an equation (labels left, amounts
  right-aligned in one `.tabular` column, a rule, the total restated), not as a row of
  equal-weight chips; and the terms are built beside the arithmetic so a page cannot render a
  breakdown that fails to add up to its own headline. The new disclosure follows both rules.

### `agent-os/specs/2026-09-05-1200-finances-envelope-workflow/`

- **Relationship:** Extends.
- **Relevant decisions:** Budget is the default finance page and keeps its section order, four
  money columns, funding bars, inspector and assignment behaviour. This spec adds to the
  summary card and changes none of that.

### `agent-os/specs/2026-08-28-2223-target-snooze/`

- **Relationship:** Context, not extended.
- **Relevant decisions:** a snoozed envelope zeroes its target term and nothing else, so it
  still contributes its overspend floor. That is a test case in Task 2, not a new rule.

## Similar implementations

### Ready to Assign summary card

- **Location:** `src/components/finances/budget/BudgetSummary.tsx`
- **Relevance:** the surface being extended, and the model for the new disclosure.
- **Key patterns:** headline figure with tone rules (`< 0` red, `=== 0` green, `> 0` plain —
  "a green surplus is not success, it is money without a job"); the `<details>` "How this adds
  up" rendering `month.terms` as a `<dl>` equation; the component takes computed terms and
  does no arithmetic of its own.

### The underfunded seam

- **Location:** `src/lib/finances/budget/assign/plan.ts` — `eligible` (51),
  `assignedToZeroBalance` (65), `neededAssigned` (86), `gapOf`, `underfundedGapCents` (112),
  `compareUnderfunded` (136)
- **Relevance:** the whole of Task 2 lives here.
- **Key patterns:** the comment at `plan.ts:95` naming `neededAssigned` as the single seam.
  `stillNeeded` must be built so that `underfundedGapCents` delegates to it rather than
  running a parallel loop.

### Per-envelope indicator

- **Location:** `src/lib/finances/budget/indicator.ts` — `envelopeIndicator`,
  `indicatorsFromAssign`, `moreNeededCents` (124), copy at 171
- **Relevance:** the pills the header total must agree with.

### Adapters and inputs

- **Location:** `src/lib/finances/budget/assign/fromBudget.ts` — `assignScanInputs`,
  `assignEnvelopeFromRow`, `assignBillsFromRows`, `currentMonthUnderfundedGap` (138),
  `isFutureBudgetMonth` (134)
- **Relevance:** `BudgetView.tsx` already builds `assignInputs` from these; Task 5 reuses that
  memo rather than loading anything new. `currentMonthUnderfundedGap` and the future-month
  sentence at `BudgetView.tsx:1592` stay as they are (D3).

### Section grouping and money formatting

- **Location:** `src/lib/finances/budget/rows.ts` — `pageSectionOf` (151), `budgetSections`;
  `src/lib/finances/money.ts` — `formatUsd`
- **Relevance:** grouping the disclosure into Bills / Regular spending / Savings, and
  rendering every amount. `formatUsd` is the ledger default (`-$10.59`); do not use
  `formatMoney` from `src/lib/tree/format.ts`.

### Colour tokens

- **Location:** `src/app/globals.css` — `--goal-unmet`, `--chart-income`, `--chart-spend`;
  `src/components/finances/budget/FundingChrome.tsx` for how they are consumed
- **Relevance:** D6. Amber says "not finished" without saying "you did something wrong".

## Numbers this is deliberately not

- `monthlyFundingPlan` / `regularIncomePlan` — `src/lib/finances/budget/incomePlan.ts`.
  Plan margin is expected regular income − planned funding: whole-month, date-blind, Savings
  excluded, `null` when any estimate is missing. It answers "does the plan balance", not
  "what is still short today". Left untouched.
- `fixThisHoleCents` — `src/lib/finances/budget/fixThis.ts`. `max(0, −readyToAssign)`, the
  over-assignment hole. A different quantity.
- `accountPoolCents` — `src/lib/finances/accountPool.ts`. Cash, not asks.
