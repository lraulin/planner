# References — budget funding indicators

**Status: frozen / complete** (2026-08-25)

## Governing specs

### `agent-os/specs/2026-08-24-1311-budget-assign-options/`

- **Relationship:** Extends. The scan layer’s `moreNeeded` is that spec’s Underfunded gap.
- **Relevant decisions:** `neededAssigned = max(demand, assignedToZeroBalance)`; remainder
  is not an ask; paused/cancelled skipped.

### `agent-os/specs/2026-08-23-2313-one-budget/`

- **Relationship:** Extends. Bills and regular envelopes stay separate tables; both get
  the indicators. Income is not budgeted.

### `agent-os/specs/2026-08-24-0930-envelope-sections/`

- **Relationship:** Extends. Savings is an ordinary envelope for assignment and for this
  scan layer.

### `agent-os/specs/2026-08-25-1154-month-ahead-zero-based/`

- **Relationship:** Extends. Monthly `n = 1` bills are a this-month ask; yearly/quarterly
  still sink (On Track horizon).

### `agent-os/specs/2026-08-22-1948-zero-based-budget/`

- **Relationship:** Extends. Envelope math unchanged. Available is leftover
  (`assigned + activity + carry-in`).

### `agent-os/specs/2026-08-22-2242-budget-goal-templates/`

- **Relationship:** Supersedes the Assigned-cell met/unmet rings driven by stored
  `goalCents`. Templates remain the live ask.

## Similar implementations

### Assign demand

- **Location:** `src/lib/finances/budget/assign/plan.ts`, `templates/demand.ts`
- **Relevance:** The indicator must not fork this math.

### Budget columns

- **Location:** `src/components/finances/budget/budgetColumns.tsx`
- **Relevance:** Assigned / Activity / Balance cells; `goalTone` rings to remove;
  Balance button that opens the cover/move menu.

### Balance / goal tones

- **Location:** `src/lib/finances/budget/rows.ts` (`balanceTone`, `goalTone`)
- **Relevance:** `balanceTone` is sign-of-leftover only — the gap this spec fills.
  `goalTone` is retired from the UI.
