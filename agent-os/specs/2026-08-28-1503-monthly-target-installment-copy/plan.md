# Monthly target installment copy

**Status: active**
Spec folder: `agent-os/specs/2026-08-28-1503-monthly-target-installment-copy/`

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-28-1000-ynab-target-engine/` — preserve target
  demand, `moreNeededCents`, sinking progress, and `On Track`.
- **Supersedes:** `agent-os/specs/2026-08-25-1310-budget-funding-indicators/` D4/D5 —
  replace only the sinking-target copy “more needed by {deadline}.”

## Context

A Geico-like target due in December 2026 can have $16.31 assigned and available while
still needing another $123.70 for the current installment. The Budget scan layer currently
describes that installment as needed “by December 2026.” That is the final target deadline,
not the period covered by the displayed shortfall, and makes the monthly ask look optional
until December.

YNAB labels the same underfunded sinking state “$X more needed this month.” The final amount
and deadline remain useful in the target editor, where the whole target is being inspected.

## Decisions

### D1 — Every positive installment shortfall is monthly

Whenever the shared indicator returns a positive `moreNeededCents`, its copy is
`"$X more needed this month"`. This applies to stored `by` and `year` targets and to yearly
or quarterly bill targets derived from their schedule.

### D2 — Sinking remains a progress horizon, not a copy horizon

The private sinking horizon still owns the full target amount used by the progress bar and
the `On Track` transition. It no longer owns or formats a final-deadline label. The displayed
shortfall continues to come from `neededAssigned`; no demand math changes.

### D3 — Deadline-free targets keep their distinct promise

A `balance` target with no deadline continues to say `"$X needed eventually"` and contributes
nothing to this month's Assign demand.

### D4 — The target editor keeps the final target

The target editor continues to summarize the full target amount, cadence or final deadline,
and this month's ask. No public API, schema, action, component prop, or component contract
changes.

## Acceptance criteria

- [ ] Every underfunded current installment reads `"$X more needed this month"`.
- [ ] A December 2026 target with $16.31 assigned and available reports a $123.70 monthly
      shortfall.
- [ ] Stored `by` and `year` targets use monthly shortfall wording.
- [ ] Yearly or quarterly derived bills use monthly shortfall wording.
- [ ] Assigning the current installment changes a future sinking target to `On Track`.
- [ ] `neededAssigned`, `moreNeededCents`, progress bars, colors, icons, and `Funded` states
      are unchanged.
- [ ] Deadline-free targets still say `"needed eventually"`.
- [ ] The target editor still shows the full target and final deadline.
- [ ] The targeted indicator test, full unit suite, lint, typecheck, browser flow, and smoke
      suite pass.

## Tasks

### Task 1 — Save spec documentation

- [x] Save `plan.md`, `shape.md`, `standards.md`, and `references.md`.
- [x] Preserve the supplied YNAB screenshot as `visuals/ynab-monthly-target-status.png`.
- [x] Commit and push the active spec.

### Task 2 — Correct the shared indicator contract

- [ ] Remove the private deadline-label path from the sinking horizon.
- [ ] Give every positive current-installment shortfall monthly wording.
- [ ] Add pure regression coverage for the reported amount, stored targets, derived sinking
      bills, `On Track`, and deadline-free behavior.
- [ ] Leave components, database code, target demand, and public contracts unchanged.

### Task 3 — Verify and freeze

- [ ] Run the targeted indicator test, `npm run test:unit`, `npm run lint`, and
      `npm run typecheck`.
- [ ] Verify the Geico-like Budget row, Assign → Underfunded amount, target editor summary,
      and `On Track` transition in the browser.
- [ ] Run `npm run smoke` against the running Planner server.
- [ ] Freeze the spec with recorded verification; do not update the roadmap.
- [ ] Commit and push the verified change with the delta-spec trailer and root cause.

## Changes from original plan

| #   | Change | Why |
| --- | ------ | --- |

## Follow-ups (new work — not amendments to this frozen spec)

None.
