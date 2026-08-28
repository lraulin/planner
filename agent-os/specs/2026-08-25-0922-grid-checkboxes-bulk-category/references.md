# References — grid checkboxes, bulk Register category, Outline Move to…

**Status: frozen / complete** (2026-08-27)

## Governing specs

### `agent-os/specs/2026-08-12-1048-finances-csv-import-register/`

- **Relationship:** Extends. Register rides the shared DataGrid.

### `agent-os/specs/2026-08-23-2023-actual-categories-and-tags/`

- **Relationship:** Extends. `budget_category_id` is the Category; the cell says Categorize.

### `agent-os/specs/2026-08-24-1522-category-by-kind-and-history/`

- **Relationship:** Extends eligibility and the picker; takes up the catalog bulk-delete
  follow-up that this spec left named and unfixed.

### `agent-os/specs/2026-08-24-1945-register-prepared-rows/`

- **Relationship:** Extends. Select-all must use the prepared navigable index, not the
  ~150 mounted virtual rows.

### `agent-os/specs/2026-08-04-0924-grid-control-surface/`

- **Relationship:** Extends the one-DataGrid rule. **Supersedes** the gutter-as-rank-index
  (`rowNumbers`) decision that later list tabs copied.

### `agent-os/specs/2026-08-06-1010-command-surface/` and `2026-08-05-2121-command-deck-and-item-actions/`

- **Relationship:** Extends. `buildGridCommands` already reads `selection.ids` for plural
  verbs. Catalog hosts never supplied them. Cut/Paste remain; Move to… is not a second
  clipboard.

### `agent-os/specs/2026-08-19-0912-always-ranked-priorities/`

- **Relationship:** Extends as the precedent for applying a field to a multi-row selection
  in one action (Set priority).

### `agent-os/specs/2026-08-24-1311-budget-assign-options/`

- **Relationship:** Extends the `allowEmpty` exception. Header select-all on a budget table
  must not change “empty selection means assign all.”

### `agent-os/specs/2026-08-09-2133-overview-and-inbox-organizer/`

- **Relationship:** Extends the shared Project Picker. Organizer / Tasks scope stay
  task-free; Outline Move to… opts into tasks and a Top level row.

### `agent-os/specs/2026-07-27-1100-scaffold-and-outline-tab/`

- **Relationship:** Extends `canNest` / `moveNode`. Multi-select drag stays deferred.

## Similar implementations

### Shared selection

- **Location:** `src/lib/grid/selection.ts`, `src/components/grid/useMultiSelect.ts`
- **Relevance:** Shift/⌘ multi-select, never-empty toggle, prune against navigable ids,
  `selectionMoveRoots`.
- **Key patterns:** Keep the never-empty rule except where `allowEmpty` is passed.

### DataGrid gutter

- **Location:** `src/components/grid/DataGrid.tsx` (`RowHandle`), `ColumnHeader.tsx`
  (`leadingGutter`)
- **Relevance:** The chrome this work replaces. Handle is also the HTML5 drag source.

### Catalog commands

- **Location:** `src/components/grid/catalogCommands.ts`
- **Relevance:** Prints `selection.count`, runs `onDelete(selection.id)`. Outline’s
  `useNodeCommandDeck` already passes `ids`.

### Register Category

- **Location:** `src/components/finances/FinancesView.tsx`, `financeColumns.tsx`,
  `CategorySelect.tsx`, `src/lib/finances/budget/mutations.ts`
  (`setTransactionBudgetCategory`), `src/lib/finances/categoryEligibility.ts`
- **Relevance:** One-row write path to widen; eligibility to skip rather than reinvent.

### Command deck plural targets

- **Location:** `src/lib/grid/commandDeck.ts` (`targetIds`, `selection.ids`)
- **Relevance:** The plumbing catalogs have to start using.

### Destination picker

- **Location:** `src/lib/projects/picker.ts`, `src/components/projects/ProjectPicker.tsx`,
  `ProjectPickerDialog.tsx`
- **Relevance:** Reuse; today `isDestinationNode` drops tasks. Move to… needs them, without
  changing Organizer.

### Outline move

- **Location:** `src/lib/tree/mutations.ts` (`moveNode`), `src/lib/tree/hierarchy.ts`
  (`canNest`, `assertCanNest`), Outline drag / indent in `OutlineGrid.tsx`
- **Relevance:** One write path; bulk Move to… plans then calls it in one transaction.

## Actual Budget (register checkboxes)

Hover-only row checkboxes in `../actual/packages/desktop-client/src/components/transactions/`.
We do **not** copy hover-only: no hover on phone, and the gutter replaces an always-on
number column.
