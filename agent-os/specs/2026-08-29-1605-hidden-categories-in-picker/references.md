# References for Hidden categories stay in the Category picker

## Governing specs

### `agent-os/specs/2026-08-26-1151-category-picker-typeahead/`

- **Relationship:** Extends the typeahead, Budget-matched tree, shared `CategorySelect`,
  filter, and New {type}… sentinels. **Supersedes** only “Hidden stays hidden” and the
  acceptance criterion that hidden envelopes and hidden-group descendants are absent.
- **Relevant decisions that carry forward:** Typeahead combobox; four type sections;
  nested groups via `budgetChildren`; filter is substring in tree order; closed field
  shows the envelope name; one control for cell / drawer / Set category.

### Budget Show Hidden (`nestedBudgetGridRows` / `sectionGridRows`)

- **Relationship:** Extends; not superseded.
- **Relevant decisions:** Budget tables omit hidden envelopes and hidden groups unless
  Show Hidden is on. That gate stays on the Budget page only.

## Similar implementations

### Category picker tree

- **Location:** `src/lib/finances/budget/groupEnvelopeOptions.ts`
- **Relevance:** The omit-filter lives here (`visibleGroups` / `visibleEnvelopes`). Catalog
  already returns `hidden` on groups and envelopes (`listBudgetEnvelopeOptions`).
- **Key patterns:** `categoryPickerSections` walks `budgetChildren`; empty groups drop;
  empty types stay for New {type}….

### CategorySelect

- **Location:** `src/components/finances/CategorySelect.tsx`
- **Relevance:** Shared open list for Register cell, drawer, splits, Set category. Renders
  headings vs envelope/create rows. Closed field uses `catalog.envelopes[].name`.
- **Key patterns:** Portalled listbox; keystrokes never write; `(hidden)` belongs on the
  open-list label, not the closed field.

### Budget visibility

- **Location:** `src/lib/finances/budget/hierarchy.ts` (`nestedBudgetGridRows`),
  `src/lib/finances/budget/rows.ts` (`sectionGridRows`)
- **Relevance:** The Show Hidden switch. Do not reuse this filter in the picker.
- **Key patterns:** `{ showHidden }` option; hidden groups drop their whole subtree.

### Actual Budget CategoryAutocomplete (divergence)

- **Location:** `../actual/packages/desktop-client/src/components/autocomplete/CategoryAutocomplete.tsx`
- **Relevance:** Actual omits hidden categories unless `showHiddenCategories` is true
  (same pref as the budget tables), and when shown appends `(hidden)`.
- **Key patterns we take:** the `(hidden)` suffix and subdued colour. **Pattern we reject:**
  gating the picker on that pref — Hide here is Budget display, not catalog availability.
