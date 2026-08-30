# References for Overassigned Available

## Governing specs

### `agent-os/specs/2026-08-25-1310-budget-funding-indicators/`

- **Relationship:** Extends D3; supersedes D4 Funded / On Track only when assigned >
  `neededAssigned`.
- **Relevant decisions:** One pure `envelopeIndicator`. Available pill + name copy + bar.
  Assigned is a plain number. Green / yellow / red / gray tokens already exist.

### `agent-os/specs/2026-08-28-2223-target-snooze/`

- **Relationship:** Extends. Snooze stays immediately after overspent.
- **Relevant decisions:** Overspent still wins. Do not insert overassigned above snooze or
  underfunded.

### `agent-os/specs/2026-08-29-2033-budget-fix-this/`

- **Relationship:** Extends D3 (Available on the right of the Un-assign list).
- **Relevant decisions:** Source month is the picker. Default amount stays
  `min(Available, hole)`. List order is Budget order.

### `agent-os/specs/2026-08-24-1311-budget-assign-options/`

- **Relationship:** Extends. The ask does not change.
- **Relevant decisions:** `neededAssigned` is what yellow already uses. Overassigned is
  `assigned − needed` when that difference is positive.

### `agent-os/specs/2026-08-28-2039-target-refill-basis/`

- **Relationship:** Context. Period vs pile is how On Track vs Funded is chosen today.
  Overassigned sits in front of both when assigned exceeds this month's ask.

## Similar implementations

### `envelopeIndicator`

- **Location:** `src/lib/finances/budget/indicator.ts`
- **Relevance:** The state machine. New branch after fully-spent, before On Track.
- **Key patterns:** First match wins. Tests in `indicator.test.ts` (yellow leftover,
  monthly never On Track, by-date On Track after installment, no-ask `safe`).

### `AvailablePill` / `FundingIcon`

- **Location:** `src/components/finances/budget/FundingChrome.tsx`
- **Relevance:** Pill classes and icons. Extract a non-button visual so Fix This can show
  the same chrome without opening cover/move.

### `FixThisDialog`

- **Location:** `src/components/finances/budget/FixThisDialog.tsx`
- **Relevance:** Envelope rows currently print `formatUsd(availableCents)`. Replace with
  the pill. Indicators must be for the picker month (`indicatorsFromAssign` +
  `assignEnvelopeFromRow` on that month's fold).

### `indicatorsFromAssign`

- **Location:** `src/lib/finances/budget/indicator.ts` (export) wired in `BudgetView.tsx`
- **Relevance:** Already builds the viewed-month map. Fix This needs the same function for
  whichever month the picker is on.

## Actual Budget

Envelope math stays Actual. The scan layer is already recorded as a YNAB UI divergence in
`docs/actual-budget/README.md` (funding-indicators). This spec adds overassigned to that
same sentence when implementing — not a new formula.
