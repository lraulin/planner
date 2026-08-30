# References for Fix This (negative Ready to Assign)

## Governing specs

### `agent-os/specs/2026-08-22-1948-zero-based-budget/`

- **Relationship:** Extends D7.
- **Relevant decisions:** Cover, move, assign-remaining, and set-assignment are all clamped
  edits of `(month, category, amount)` plus a movement note. Unassign-to-RTA is the missing
  inverse of `assignFromReadyToAssign`. No transfer record.

### `agent-os/specs/2026-08-24-1311-budget-assign-options/`

- **Relationship:** Extends. Does not replace the eight Auto options.
- **Relevant decisions:** Assign is the fill gesture and is clamped so it cannot drive RTA
  negative. Existing negatives (inline Assigned, future-month jobs, last-month overspend)
  stay the fold telling the truth. Tools ▸ Assign remains. This spec only morphs the
  summary button when that truth is a deficit.

### `agent-os/specs/2026-08-25-1154-month-ahead-zero-based/`

- **Relationship:** Extends D3.
- **Relevant decisions:** Displayed RTA subtracts assigned-in-future. “Over-assigning by
  hand can still make a later month’s Ready to Assign negative; the fix is to move money
  back — same as YNAB, no extra machinery.” This spec is that UI. Past months stay
  historical, so Fix This is current and future only.

### `agent-os/specs/2026-08-27-0757-currency-expression-entry/`

- **Relationship:** Extends.
- **Relevant decisions:** Amount fields go through `parseAmountEntryCents`. Move money was
  already on that list; Fix This’s amount field joins it.

### `agent-os/specs/2026-08-25-1633-budget-inspector/`

- **Relationship:** Context. Cover / move stay on the Available cell (D7 item 5). This spec
  does not move them into the inspector.

## Similar implementations

### `transferBetweenCategories` / `assignFromReadyToAssign` / `setAssignment`

- **Location:** `src/lib/finances/budget/operations.ts`
- **Relevance:** The clamps and movement-note voice. Unassign is `assigned' = assigned −
moved`, clamped to Available, destination Ready to Assign (not an envelope).
- **Key patterns:** Return `NO_EDIT` rather than throw; absolute new amounts; `onDay` in
  the note.

### `BudgetSummary`

- **Location:** `src/components/finances/budget/BudgetSummary.tsx`
- **Relevance:** The red number and `readyToAssignNote` already exist. The bug is layout
  (`ml-auto` Assign, muted note between number and action). D2 rewrites this component.

### `AssignDialog` / `MoveMoneyDialog`

- **Location:** `src/components/finances/budget/AssignDialog.tsx`, `MoveMoneyDialog.tsx`
- **Relevance:** ModalShell, expression amount, Cancel | verb. Fix This is a new dialog
  (source register), not a tab on Assign and not a destination on Move Money.

### Fold future assignments

- **Location:** `src/lib/finances/budget/envelope.ts` `applyAssignedInFuture`
- **Relevance:** D4 — writing a later month’s assigned is how the viewed month’s displayed
  RTA recovers. `BudgetData.months` already holds the horizon, so the picker needs no extra
  query.

### Command registration

- **Location:** `src/components/finances/budget/BudgetView.tsx` (Assign commands),
  `src/lib/commands/menus.ts` (`NESTED_SECTIONS` includes `"Assign"`)
- **Relevance:** `budget.fix-this` is a sibling Tools command, not a ninth Assign option.

## Actual Budget

`docs/actual-budget/README.md` points at `packages/loot-core/src/server/budget/actions.ts`
for movement clamps. Actual has no YNAB Fix This banner. Envelope arithmetic stays Actual;
this gesture is YNAB. Record the named UI divergence there when implementing.
