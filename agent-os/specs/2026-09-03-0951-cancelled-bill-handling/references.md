# References for Cancelled bill handling

## Governing specs

### `agent-os/specs/2026-08-23-2313-one-budget/`

- **Relationship:** Extends. A bill is a `kind: 'bill'` row on `finance_budget_categories`
  with `status` `active | paused | cancelled`. `/finances/budget` is the only budgeting page.
- **Relevant decisions that carry forward:** cancelled keeps the row and history; it is not
  a delete. Recurrence is derived from charge history, not a stored skip cursor.

### `agent-os/specs/2026-08-22-1948-zero-based-budget/` (and later structure work)

- **Relationship:** Extends. Hide is a Budget display flag; Show Hidden is the grid switch.
- **Relevant decisions:** hidden rows drop from the grid, not from totals. This spec uses
  the same omit-from-grid pattern for quiet cancelled bills.

### `agent-os/specs/2026-08-25-1633-budget-inspector/`

- **Relationship:** Extends. Bill status, next charge, cadence, URL live in the inspector.
- **Changed here:** cancelled scheduled bills omit Next charge (D6). A charge-after-cancel
  warning is added to the Bill section (D5).

### `agent-os/specs/2026-08-21-2038-paused-bills-assignment/`

- **Relationship:** Extends. Cancelled keeps history and is not an ask; paused stays on the
  grid (house-move).
- **Unchanged:** Pause. Pre-one-budget “cancelled is off the Commitments grid” is the
  ancestor of D2, now restated against envelope money columns.

### `agent-os/specs/2026-08-25-0901-bill-next-charge/`

- **Relationship:** Extends the write (`anchorDate` via `onPatchBill`,
  `nextChargeWriteError`). **Supersedes D5 only for cancelled:** next-due is no longer
  displayed for every scheduled bill of any status. Paused still shows and edits next charge.
- **Relevant decisions that carry forward:** unscheduled still has no date picker; clearing
  still returns to the derived date; do not store a date on or before the last posted charge.

### `agent-os/specs/2026-08-29-1605-hidden-categories-in-picker/` and

`agent-os/specs/2026-08-30-1331-category-picker-everywhere/`

- **Relationship:** Extends. Register still lists retired envelopes, marked when hidden, so
  history can be filed. Destination catalogs omit hidden, not cancelled (out of scope here).

## Similar implementations

### Budget grid visibility

- **Location:** `src/lib/finances/budget/hierarchy.ts` (`nestedBudgetGridRows`),
  `src/lib/finances/budget/rows.ts` (`sectionGridRows`)
- **Relevance:** The Show Hidden gate. Extend this predicate; do not filter in `BudgetView`.
- **Key patterns:** `{ showHidden }`; hidden groups drop their subtree; `budgetRows` still
  carries every envelope so totals do not drift.

### Next-due walk

- **Location:** `src/lib/finances/budget/queries.ts` (`loadBillAnchors` /
  `loadNextDueKeys`), `src/lib/finances/commitments.ts` (`billAnchor`)
- **Relevance:** Today walks every scheduled bill of any status (bill-next-charge D5). Skip
  cancelled only; do not clear `anchorDate`.
- **Key patterns:** distinct from `loadBillSnapshots`, which already skips non-active.

### Inspector bill facet

- **Location:** `src/lib/finances/budget/inspector.ts` (`billInspectorView`),
  `src/components/finances/budget/BudgetInspector.tsx`
- **Relevance:** Next charge editor vs Unscheduled copy; status select; warning belongs here.
- **Key patterns:** `showDateEditor` already false for unscheduled; cancelled should not
  reuse Unscheduled copy.

### Assign / funding skip

- **Location:** `src/lib/finances/budget/assign/plan.ts`,
  `src/lib/finances/budget/indicator.ts` (`isInactive`)
- **Relevance:** Cancelled is already not an ask and is skipped by Assign. Do not change.
  Fix This / cover-from still need cancelled-with-Available so leftover can be drained.

### Schema comments

- **Location:** `src/db/schema.ts` (`ENVELOPE_STATUSES`, `finance_budget_categories.status`)
- **Relevance:** `cancelled` “stops every forward-looking figure — the next-due walk, the
  annual total — but keeps the row and its history.” D6 makes the next-due walk match that
  comment; visibility (D2) is the new part.
