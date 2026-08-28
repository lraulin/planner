# References for monthly target installment copy

**Status: active**

## Governing specs

- `agent-os/specs/2026-08-28-1000-ynab-target-engine/plan.md` — D3 defines spread demand;
  Task 8 preserves `moreNeededCents`, the sinking bar, and `On Track`. This delta extends
  those semantics without changing their math.
- `agent-os/specs/2026-08-25-1310-budget-funding-indicators/plan.md` — D3 requires the
  indicator gap to equal Assign's gap. This delta supersedes only D4/D5's sinking copy
  “more needed by {horizon}.”

## Code and tests

- `src/lib/finances/budget/indicator.ts` — the single shared indicator. Its private
  `horizonOf` currently attaches `byLabel` to sinking targets and the underfunded branch
  formats that final deadline as if it described the monthly installment.
- `src/lib/finances/budget/indicator.test.ts` — pure state-machine coverage for stored
  targets, derived bill targets, `On Track`, and `needed eventually`; the regression belongs
  here.
- `src/components/finances/budget/budgetColumns.tsx` — displays `EnvelopeIndicator.copy`
  without reinterpreting it. No component change is required.
- `src/components/finances/budget/TargetDrawer.tsx` — the existing target-editor summary
  uses `summarize(resolved.target)` plus the current-month ask. It remains the place that
  shows the full amount and deadline.

## Visual reference

- `visuals/ynab-monthly-target-status.png` — supplied YNAB Budget screenshot. Future sinking
  targets such as GEICO and Propane use “more needed this month”; due-this-month bills can
  independently use their due-day wording in YNAB. Planner standardizes every positive
  current-installment shortfall on the monthly sentence.
