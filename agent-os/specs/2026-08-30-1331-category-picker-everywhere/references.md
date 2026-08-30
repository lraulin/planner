# References for Category picker on every remaining chooser

## Governing specs

### `agent-os/specs/2026-08-26-1151-category-picker-typeahead/`

- **Relationship:** Extends the typeahead, Budget-matched tree, filter, closed-field name,
  no mint-from-text. **Supersedes** “Payees / Supplies / Move money stay as they are.”
- **Relevant decisions that carry forward:** Combobox, four type sections, nested groups
  via `budgetChildren`, substring filter in tree order, portalled list, no new dependency.

### `agent-os/specs/2026-08-29-1605-hidden-categories-in-picker/`

- **Relationship:** Extends for filing surfaces (Register, Payees). **Supersedes** “no
  per-surface filter” only insofar as destination catalogs omit hidden. Hide remains a
  Budget display flag; Register still lists hidden so history can be filed.
- **Relevant decisions that carry forward:** `(hidden)` marker on open-list rows; closed
  field is the name; filter does not match the marker; auto-assign still skips hidden.

### `agent-os/specs/2026-08-24-1311-budget-assign-options/`

- **Relationship:** Extends D8 (Manual To omits Income; no auto-assign preview).
- **Relevant decisions:** Manual is Assign remaining. Income never participates.

### `agent-os/specs/2026-08-23-0748-finance-payees/` and `2026-08-24-1522-category-by-kind-and-history/`

- **Relationship:** Extends. Learned/fixed auto-category stays on the payee row.
- **Relevant decisions:** Claims beat learned/fixed. Only the chooser control changes.

### `agent-os/specs/2026-08-26-0910-supplies-worksheet/`

- **Relationship:** Extends D3 (`envelope_id` nullable FK; group label is a different
  field). Supplies does not create or write envelopes.

## Similar implementations

### CategorySelect

- **Location:** `src/components/finances/CategorySelect.tsx`
- **Relevance:** The control to extend (`onCreate` optional, `allowClear`, `placeholder`,
  `detail` on envelope rows). Call sites today: `financeColumns.tsx`,
  `TransactionDrawer.tsx`, `SplitEditor.tsx`, `FinancesView.tsx` (Set category).
- **Key patterns:** Portalled listbox; keystrokes never write; hover does not move the
  highlight; `comboboxOwnsEscape`.

### Picker tree

- **Location:** `src/lib/finances/budget/groupEnvelopeOptions.ts`
- **Relevance:** `categoryPickerSections` / `commitCategoryPicker`. Create-off and
  allowClear belong here, with tests.
- **Key patterns:** `budgetChildren` walk; empty groups drop; empty types stay only for
  New {type}….

### Budget visibility

- **Location:** `src/lib/finances/budget/hierarchy.ts` (`nestedBudgetGridRows`),
  `src/lib/finances/budget/rows.ts` (`moveTargets`, `sectionGridRows`)
- **Relevance:** Destination catalogs reuse the `{ showHidden: false }` predicate, not the
  page switch. `moveTargets` already drops Income and the source; it still includes hidden.
- **Key patterns:** Drop hidden groups and their envelopes; do not reparent orphans.

### Envelope catalog query

- **Location:** `src/lib/finances/budget/queries.ts` (`listBudgetEnvelopeOptions`)
- **Relevance:** Payees already loads groups and throws them away
  (`src/app/finances/payees/page.tsx`). Supplies uses a name-only
  `listSupplyEnvelopes` (`src/lib/finances/supplies/queries.ts`) that should die.

### Surfaces being replaced

- **Location:** `src/components/finances/budget/MoveMoneyDialog.tsx` (native `<select>`,
  name + Available), `AssignDialog.tsx` (optgroups, names),
  `src/components/finances/payees/PayeeDrawer.tsx` (`SelectField` on path `label`),
  `src/components/finances/supplies/suppliesColumns.tsx` (Funded from `<select>`).
