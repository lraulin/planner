# References for Inline Budget Structure

## Governing specs

### `agent-os/specs/2026-08-23-2313-one-budget/`

- **Relationship:** Extends.
- **Relevant decisions:** a bill _is_ an envelope — one `finance_budget_categories` row with
  `kind = 'bill'` and a nullable facet, not a separate table. This is what makes "create a
  bill" the same operation as "create an envelope" and why D1 is a small change rather than a
  new write path. Also D2 there: recurrence is derived from charge history (`nextDueFrom`)
  rather than a stored cursor, which is why a new bill with no charges is still a legal row.

### `agent-os/specs/2026-08-24-0930-envelope-sections/`

- **Relationship:** Extends, and **supersedes one decision**.
- **Carries forward:** `kind` (`income | spending | bill | savings`) is the section; groups
  are optional organisational containers at any depth, inside a section; `group_id` is
  nullable so an envelope can sit at a section root; a group whose envelopes span sections is
  prevented by the UI, not the schema.
- **Superseded:** **Changes from original plan row 2** — "A bill is still created from Review,
  not by picking `bill` here … Creating a bill requires a cadence, which the blank-envelope
  form does not collect." Also the code that expresses it: `ENVELOPE_SECTION_KINDS`
  (`src/db/schema.ts:2481`) and the refusals in `createBudgetCategory` /
  `updateBudgetCategory`.

### `agent-os/specs/2026-08-25-1633-budget-inspector/`

- **Relationship:** Extends — and it is the reason this spec is possible.
- **Relevant decisions:** D2, bill-only fields (cadence, next charge, amount, status, URL,
  derived yearly) live in the inspector rather than as grid columns. That is where a
  monthly-by-default bill gets finished, so the create gesture does not have to collect a
  cadence.

### `agent-os/specs/2026-08-27-2200-plan-gutter-drag-handle/`

- **Relationship:** Extends — a constraint honoured, not changed.
- **Relevant decisions:** two gutter modes chosen explicitly per grid; "a grid that passes
  `rowDrag` must use `handle`"; "Everything else keeps the checkbox — Register, **the three
  Budget tables**, …" with the header tri-state select-all intact. This is why D6 ships row
  commands instead of grid drag.

### `agent-os/specs/2026-08-23-1807-nested-budget-groups-bill-import/`

- **Relationship:** Extends; **supersedes** only its structure-editing surface.
- **Carries forward:** groups may contain child groups and envelopes in one ordered sequence
  at any depth; every group shows recursive totals; only an empty group may be deleted;
  envelopes keep their explicit destructive delete.

### `agent-os/specs/2026-08-21-1810-register-track-as-bill/`

- **Relationship:** Neither extended nor superseded — explicitly left alone.
- **Relevant decisions:** D5, prefill from the whole merchant's history; D7, reuse
  `setRecurringBillAction`. A bill declared from a real charge is strictly better informed
  than a blank one, so that path stays exactly as it is. This spec adds a _fourth_ entry
  point for bills that have never charged you.

### `agent-os/specs/2026-08-22-1948-zero-based-budget/`

- **Relationship:** Untouched, listed so it is not accidentally disturbed.
- **Relevant decisions:** the Actual-derived envelope arithmetic. No number on the page
  changes in this spec; only structure editing does.

## Similar implementations

### The surface being replaced

- **Location:** `src/components/finances/budget/BudgetStructureDrawer.tsx` (780 lines).
- **Relevance:** every behaviour this spec relocates. Read before deleting.
- **Key pieces to carry over:** `moveRelative` (`:107`) → Move up / Move down;
  `NameEditor`'s "Move to…" `<select>` (`:603`+) → `moveDestinations`, including its
  descendant and section filtering; the delete `ConfirmDialog` copy (`:270-292`) — _"Its
  transactions remain and return to the backlog."_ and _"Move every subgroup and envelope out
  before deleting"_; the per-group and root create inputs (`:196`, `:445`, `:487`).
- **Not carried over:** its hand-rolled HTML5 drag (`handleDrop` `:129`), which is the second
  drag implementation in the codebase and desktop-only.

### The grid and its group headers

- **Location:** `src/components/grid/DataGrid.tsx` — `GroupHeader` (`:1759`), `RowDrag`
  (`:91`), `gutter` (`:233`, `:287`), `rowMenu` (nullable row).
- **Relevance:** where `groupChrome` lands, and why the header must have its click stopped —
  `onClick={onToggle}` is on the whole header row.

### Inline editing precedent

- **Location:** `src/components/grid/cells.tsx` — `TextCell` (`:739`), `AmountCell` (`:377`).
- **Relevance:** the commit-on-Enter/blur, revert-on-Escape contract D5 follows. The budget
  name cell cannot simply _be_ a `TextCell` — it also carries the "rolls over" chip, the
  indicator copy, the `FundingBar` and the compact activity link — so it swaps to an input
  only while renaming.

### The pure hierarchy layer

- **Location:** `src/lib/finances/budget/hierarchy.ts` — `budgetChildren` (`:31`),
  `descendantGroupIds` (`:57`), `groupPageSection` (`:221`), `resolveBudgetDrop` (`:237`);
  `rows.ts` — `sectionGridRows` (`:186`), `pageSectionOf` (`:149`).
- **Relevance:** `moveDestinations` belongs here beside them, and `resolveBudgetDrop` already
  encodes the legality rules it must agree with.

### The writes, all of which already exist

- **Location:** `src/lib/finances/budget/mutations.ts` — `createCategoryGroup` (`:518`),
  `createBudgetCategory` (`:541`), `updateBudgetCategory` (`:581`), `renameCategoryGroup`
  (`:664`), `deleteBudgetCategory` (`:691`), `deleteCategoryGroup` (`:731`),
  `moveBudgetStructureItem` (`:797`), `moveBudgetStructureItemIntoGroup` (`:864`).
- **Relevance:** this spec adds **no new mutation**. Only `createBudgetCategory` and
  `updateBudgetCategory` change, and only to stop refusing `bill`.

### The bill write that is deliberately not used for creation

- **Location:** `src/lib/finances/mutations.ts` — `BillEnvelopeEdit` (`:614`),
  `upsertBillEnvelope` (`:776`), `trackTransactionAsBill` (`:698`).
- **Relevance:** D2. Keyed on **name**, so it is the right write for Review's idempotent
  declaration and the wrong one for a typed-in bill.

### Existing bill-creation entry points (all require a transaction)

- `src/components/finances/FinancesView.tsx:638` — `record.track-as-bill`, and
  `onCreateEnvelope` (`:503-518`) routing the picker's "New bill…" sentinel.
- `src/components/finances/budget/ReviewDrawer.tsx:109, 202` — the Budget page's Review.
- `src/components/finances/insights/OneOffReview.tsx:78-93`.
- `src/lib/agent/financeTools.ts:736, 798` — the only transaction-free creators today,
  proof that `upsertBillEnvelope` with a name and a cadence is sufficient.
