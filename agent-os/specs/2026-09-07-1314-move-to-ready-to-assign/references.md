# References for Move money to Ready to Assign

## Governing specs

### `agent-os/specs/2026-08-22-1948-zero-based-budget/`

- **Relationship:** Extends D7 (clamped allocation edits, no transfer record).
- **Relevant decisions:** Move money is Rule 3; Ready to Assign is the unassigned remainder,
  not a category row.

### `agent-os/specs/2026-08-26-1151-category-picker-typeahead/`

- **Relationship:** Extends the shared `CategorySelect`; supersedes “Move money stay as they
  are” (Move money already uses the typeahead).
- **Relevant decisions:** One control; keystrokes never write; `includeCreate` is already
  the pattern for an opt-in extra row. Filing surfaces must not grow destination-only rows.

### `agent-os/specs/2026-08-29-2033-budget-fix-this/`

- **Relationship:** Extends D5. Does not replace Fix This.
- **Relevant decisions:** `unassignToReadyToAssign` / `kind: "unassign"` is the write that
  returns Available to Ready to Assign. D6 explicitly left envelope-to-envelope Move money
  alone; this delta adds RTA as a Move money _destination_ without changing Fix This.

### `agent-os/specs/2026-08-29-1605-hidden-categories-in-picker/`

- **Relationship:** Extends. Move money still uses `visibleEnvelopeCatalog`.
- **Relevant decisions:** Hidden envelopes stay out of destinations. Ready to Assign is not
  in that catalog.

### `agent-os/specs/2026-08-24-1311-budget-assign-options/`

- **Relationship:** Does not change Assign.
- **Relevant decisions:** Assign consumes Ready to Assign into an envelope. The inverse
  from an envelope’s row menu is Move money (this spec), not Assign To.

## Similar implementations

### Cover overspending — Ready to Assign first as a source

- **Location:** `src/components/finances/budget/BudgetView.tsx` (`rowMenuItems`, Cover
  overspending from)
- **Relevance:** In-app precedent for listing Ready to Assign first, then envelopes, with
  `from: null` meaning not-an-envelope.
- **Key patterns:** Disabled with a reason when RTA ≤ 0; formatUsd in the label.

### Unassign write

- **Location:** `src/lib/finances/budget/operations.ts` (`unassignToReadyToAssign`,
  `unassignMovedCents`)
- **Relevance:** The Move money → Ready to Assign write. Already tested in
  `operations.test.ts` and `mutations.integration.test.ts` (including cross-user).
- **Key patterns:** Clamp to Available; Assigned may go negative; note names Ready to Assign.

### Move money dialog + picker

- **Location:** `src/components/finances/budget/MoveMoneyDialog.tsx`,
  `src/components/finances/CategorySelect.tsx`,
  `src/lib/finances/budget/groupEnvelopeOptions.ts`,
  `src/lib/finances/budget/rows.ts` (`moveTargets`)
- **Relevance:** Destination catalog is already `visibleEnvelopeCatalog` without create.
  Default To is `firstEnvelopeId`. `BudgetView` looks up `toId` in `move.targets` and
  always dispatches `transfer` — that lookup is what must branch on the sentinel.

### Actual Budget

- **Location:** `docs/actual-budget/README.md` → `packages/loot-core/src/server/budget/actions.ts`
- **Relevance:** No transfer record; movement is allocation arithmetic. “To Budget” is
  Actual’s name for Ready to Assign. We keep our YNAB wording.
