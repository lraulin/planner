# Monthly target installment copy

**Status: frozen / complete** (2026-08-28)
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

- [x] Every underfunded current installment reads `"$X more needed this month"`.
- [x] A December 2026 target with $16.31 assigned and available reports a $123.70 monthly
      shortfall.
- [x] Stored `by` and `year` targets use monthly shortfall wording.
- [x] Yearly or quarterly derived bills use monthly shortfall wording.
- [x] Assigning the current installment changes a future sinking target to `On Track`.
- [x] `neededAssigned`, `moreNeededCents`, progress bars, colors, icons, and `Funded` states
      are unchanged.
- [x] Deadline-free targets still say `"needed eventually"`.
- [x] The target editor still shows the full target and final deadline.
- [x] The targeted indicator test, full unit suite, lint, typecheck, browser flow, and smoke
      suite pass.

## Tasks

### Task 1 — Save spec documentation

- [x] Save `plan.md`, `shape.md`, `standards.md`, and `references.md`.
- [x] Preserve the supplied YNAB screenshot as `visuals/ynab-monthly-target-status.png`.
- [x] Commit and push the active spec.

### Task 2 — Correct the shared indicator contract

- [x] Remove the private deadline-label path from the sinking horizon.
- [x] Give every positive current-installment shortfall monthly wording.
- [x] Add pure regression coverage for the reported amount, stored targets, derived sinking
      bills, `On Track`, and deadline-free behavior.
- [x] Leave components, database code, target demand, and public contracts unchanged.

### Task 3 — Verify and freeze

- [x] Run the targeted indicator test, `npm run test:unit`, `npm run lint`, and
      `npm run typecheck`.
- [x] Verify the Geico-like Budget row, Assign → Underfunded amount, target editor summary,
      and `On Track` transition in the browser.
- [x] Run `npm run smoke` against the running Planner server.
- [x] Freeze the spec with recorded verification; do not update the roadmap.
- [x] Commit and push the verified change with the delta-spec trailer and root cause.

## As built

`src/lib/finances/budget/indicator.ts` no longer carries a `byLabel` on the private sinking
horizon. That horizon retains only `targetCents`, which still drives the sinking bar and
`On Track`. The one underfunded branch now formats every positive current-installment gap
as `"$X more needed this month"`.

Pure tests pin the reported $123.70 case, stored `by` and `year` targets, a quarterly derived
bill, the sinking `On Track` transition, and deadline-free `"needed eventually"` behavior.

## Verification

- `npx vitest run --project unit src/lib/finances/budget/indicator.test.ts` — 24 tests passed.
- `npm run test:unit` — 313 files, 3,666 tests passed.
- `npm run lint` — passed with zero warnings.
- `npm run typecheck` — passed.
- Browser, `/finances/budget` — a Geico target with $16.31 assigned/available displayed
  `$123.70 more needed this month`; selecting only Geico made Assign → Underfunded offer
$123.70; the inspector offered `Assign $123.70 to stay on track`.
- Browser, target editor — displayed `Have $700.05 available by December 2026. This month
asks $140.01.`
- Browser, assignment — assigning $140.01 directly in the row changed Geico to `On Track`.
- `npm run smoke` — all 61 routes rendered against the running dev server.
- Roadmap deliberately unchanged; this is a correction to already-shipped scan-layer copy.

## Changes from original plan

| #   | Change | Why |
| --- | ------ | --- |

## Follow-ups (new work — not amendments to this frozen spec)

None.
