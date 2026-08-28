# Monthly target installment copy — shaping notes

**Status: active**

## Reported case

The Geico envelope is saving toward a December 2026 target. With $16.31 assigned and
available, the current installment is still short $123.70, but Planner labels that amount
“more needed by December 2026.” The number is a this-month installment, while December is
the deadline for the whole target.

The supplied YNAB reference shows the intended scan-layer language on its selected GEICO
row: a future sinking target says “$36.88 more needed this month.”

## Agreed scope

- Correct the single shared Budget indicator so every positive current-installment gap says
  “more needed this month.”
- Apply it to stored `by` / `year` targets and yearly or quarterly derived bill targets.
- Remove only the private sinking-deadline label that becomes unused.
- Keep the final deadline in the target editor, where the complete target is described.
- Prove the amount and state transitions through pure tests and the running app.

## Explicit non-goals

- No change to target demand, installment calculation, `neededAssigned`, or
  `moreNeededCents`.
- No change to progress bars, colors, icons, `On Track`, `Funded`, or overspending priority.
- No schema, migration, database, server-action, component-prop, or public API change.
- No component tests or database tests.
- No roadmap update; this corrects shipped scan-layer wording rather than completing a
  roadmap item.
- No deliberate divergence from the YNAB target engine beyond the vocabulary decisions
  already recorded in its governing spec.
