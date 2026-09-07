# References for Assign under Target

**Status: frozen / complete** (2026-09-07)

## Governing specs

### `agent-os/specs/2026-08-25-1633-budget-inspector/`

- **Relationship:** Extends D7 Target + quick action; does not supersede.
- **Relevant decisions:** Inspector content order; "Assign $X to stay on track"
  is one-row Underfunded and must not drive Ready to Assign negative. That button
  currently renders after Files here (`BudgetInspector.tsx`).

### `agent-os/specs/2026-08-24-1311-budget-assign-options/`

- **Relationship:** Extends.
- **Relevant decisions:** RTA clamp; `neededAssigned`; inspector must not grow a
  second assign engine.

### `agent-os/specs/2026-08-25-0831-assign-skip-full-single/`

- **Relationship:** Extends.
- **Relevant decisions:** `needsAssignPreview` — one fully fundable envelope
  writes immediately.

### `agent-os/specs/2026-08-25-1310-budget-funding-indicators/`

- **Relationship:** Extends D3 (one ask). Scan-layer copy stays on the grid.

### `agent-os/specs/2026-08-28-1000-ynab-target-engine/` and deltas

- **Relationship:** Extends. Target JSONB, behaviours, cadences, bases.
- **Do not reopen.** Especially `target-refill-basis`, `pile-spent-is-not-a-raid`,
  `one-time-savings-goal`, `deadline-free-goal-never-asks`.

### `agent-os/specs/2026-08-28-1503-monthly-target-installment-copy/`

- **Relationship:** Extends.
- **Relevant decisions:** Positive `moreNeededCents` is "this month"; the sinking
  horizon still owns the full amount for the bar.

### `agent-os/specs/2026-08-28-2223-target-snooze/`

- **Relationship:** Extends.
- **Relevant decisions:** Toggle already in Target; snooze zeroes the target term
  of the ask; overspend floor survives.

### `agent-os/specs/2026-08-29-2206-ready-to-assign-derivation/`

- **Relationship:** Extends.
- **Relevant decisions:** Ready to Assign is derived leftover, not a category.

## Similar implementations

### Inspector Target section and Underfunded button

- **Location:** `src/components/finances/budget/BudgetInspector.tsx`
- **Relevance:** Copy, Edit/Create, snooze, and the misplaced Assign button.
- **Key patterns:** `scan.moreNeededCents`, `onAssignUnderfunded`,
  `summarize(row.target)`, `snoozeUnavailableReason`.

### One-row Underfunded wiring

- **Location:** `src/components/finances/budget/BudgetView.tsx` (`onAssignUnderfunded`)
- **Relevance:** `planAssign({ option: "underfunded", categoryIds: [row.id] })` then
  `startAssign`. Reuse as-is.

### Indicator horizon and fill

- **Location:** `src/lib/finances/budget/indicator.ts`
- **Relevance:** `moreNeededCents`, `horizonOf` / `fillsWith` / `barToward`. Needed
  / Funded / To Go must read these, not invent a parallel.

### Assign planner

- **Location:** `src/lib/finances/budget/assign/plan.ts`
- **Relevance:** `neededAssigned`, RTA clamp, `needsAssignPreview`.

### Target sentences

- **Location:** `src/lib/finances/budget/targets/types.ts` `summarize`

### Inspector view-model already in lib

- **Location:** `src/lib/finances/budget/inspector.ts`
- **Relevance:** `inspectorBreakdown`, `billInspectorView` — same home for the
  Target pane view-model unless extracting a sibling keeps indicator.ts the single
  owner of horizon/fill.
