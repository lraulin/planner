# References — budget inspector

**Status: frozen / complete** (2026-08-25)

## Governing specs

### `agent-os/specs/2026-08-23-2313-one-budget/`

- **Relationship:** Extends the model (a bill is an envelope). Supersedes D6 only for
  "Bills keep the Commitments columns" on the grid.
- **Relevant decisions:** One page; Regular then Bills then All spending; bill cadence is
  the ask.

### `agent-os/specs/2026-08-24-0930-envelope-sections/`

- **Relationship:** Extends. `kind` is the section. Savings is a peer, excluded from All
  spending.

### `agent-os/specs/2026-08-25-1310-budget-funding-indicators/`

- **Relationship:** Extends. Scan layer stays on the grid. This spec takes D8's deferred
  YNAB inspector pane.

### `agent-os/specs/2026-08-25-0901-bill-next-charge/`

- **Relationship:** Extends. The `anchorDate` write and `nextChargeWriteError` move into
  the inspector; validation is unchanged.

### `agent-os/specs/2026-08-14-1104-unscheduled-bills/`

- **Relationship:** Extends. `scheduled: false` is propane. Inspector must not invent a
  date.

### `agent-os/specs/2026-08-22-2242-budget-goal-templates/`

- **Relationship:** Extends. `TemplateDrawer` remains the editor for Regular/Savings asks.

### `agent-os/specs/2026-08-24-1311-budget-assign-options/`

- **Relationship:** Extends. Inspector "Assign $X" is one-row Underfunded.

## Similar implementations

### Budget view and columns

- **Location:** `src/components/finances/budget/BudgetView.tsx`, `budgetColumns.tsx`
- **Relevance:** Three tables, `onPatchBill`, `focusedTable`, `useGridState` already drops
  unknown column ids.

### Drawers

- **Location:** `src/components/detail/Drawer.tsx`, `TemplateDrawer.tsx`,
  `BudgetStructureDrawer.tsx`, `ReviewDrawer.tsx`
- **Relevance:** Phone sheet reuses Drawer; do not replace those drawers with the inspector.

### Compact row open

- **Location:** `src/components/grid/CompactRow.tsx`
- **Relevance:** Tap opens detail except on `input` / `select` / `button` — Assigned,
  Available, and the checkbox already skip the sheet.

### Bill writes

- **Location:** `src/lib/finances/mutations.ts` (`upsertBillEnvelope`),
  `nextChargeWriteError` in commitments/next-due helpers
- **Relevance:** Same action the grid cells used.
