# References for Category picker typeahead

## Governing specs

### `agent-os/specs/2026-08-24-1522-category-by-kind-and-history/`

- **Relationship:** Extends D2 (New {type}… per section). Supersedes D1 as implemented
  (type-only `<optgroup>` list).
- **Relevant decisions:** Four sections; empty sections stay; create sentinels never
  become the stored Category.

### `agent-os/specs/2026-08-24-0930-envelope-sections/`

- **Relationship:** Extends.
- **Relevant decisions:** Section is `kind`. Groups are optional organisational containers
  inside a section. `groupId` null sits on the type. A mixed group may render in more than
  one type.

### `agent-os/specs/2026-08-23-1807-nested-budget-groups-bill-import/`

- **Relationship:** Extends.
- **Relevant decisions:** Arbitrary-depth groups. Groups and envelopes share one sibling
  sequence (`sortKey` via `budgetChildren`).

### `agent-os/specs/2026-08-25-0922-grid-checkboxes-bulk-category/`

- **Relationship:** Extends.
- **Relevant decisions:** One picker for the cell, the drawer, and Set category…. Bulk
  write path unchanged.

## Similar implementations

### Current CategorySelect

- **Location:** `src/components/finances/CategorySelect.tsx`
- **Relevance:** The control being replaced. Call sites: `financeColumns.tsx`,
  `TransactionDrawer.tsx`, `FinancesView.tsx` (Set category modal).
- **Key patterns:** `onChange(id | null)` / `onCreate(kind)`; `parseNewEnvelopeKind` on
  sentinel values.

### Envelope grouping (today)

- **Location:** `src/lib/finances/budget/groupEnvelopeOptions.ts`
- **Relevance:** Type-only grouping plus create sentinels. Successor must keep section
  order and sentinels; add nested groups and filter.

### Budget sibling order

- **Location:** `src/lib/finances/budget/hierarchy.ts` (`budgetChildren`,
  `budgetEnvelopeLabel`, hidden / descendant helpers)
- **Relevance:** Do not invent a second walk. Picker tree should be `budgetChildren`
  restricted to the current type’s visible envelopes.

### Envelope catalog query

- **Location:** `src/lib/finances/budget/queries.ts` (`listBudgetEnvelopeOptions`,
  `groupsOf`, `categoriesOf`)
- **Relevance:** Query already loads groups; the public return type currently drops them.
  Payees uses `label` (full path) on a flat SelectField and stays that way.

### Command palette typeahead

- **Location:** `src/components/shell/CommandPaletteDialog.tsx`,
  `src/lib/commands/registry.ts` (`matchCommands`)
- **Relevance:** Input + grouped list + arrow/Enter/Escape, no extra dependency. Filter
  here keeps budget order instead of ranking.

### Column menu popover

- **Location:** `src/components/grid/ColumnMenu.tsx`
- **Relevance:** Measure the anchor before first paint and hang a panel so it is not
  clipped or off-screen. Category list needs the same for grid cells.

### ComboboxField (do not reuse for this)

- **Location:** `src/components/detail/fields.tsx`
- **Relevance:** Native `<datalist>` — no nested headings, no New {type}…, browser-dependent
  keyboard. Confirmed out during shaping.
