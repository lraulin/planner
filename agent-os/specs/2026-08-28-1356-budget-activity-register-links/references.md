# References for Budget Activity → filtered Register

## Governing specs

### `agent-os/specs/2026-08-22-1948-zero-based-budget/`

- **Relationship:** Extends. Activity is the month rollup; D6 already links the uncategorized tray to a filtered Register.
- **Relevant decisions:** Envelope formulas; uncategorized count is a Register deep link, not a second list on Budget.

### `agent-os/specs/2026-08-23-2313-one-budget/`

- **Relationship:** Extends. `/finances/budget` is the only budgeting page; Assigned / Activity / Available are the money columns.

### `agent-os/specs/2026-08-25-1633-budget-inspector/`

- **Relationship:** Extends. Inspector Available-breakdown Activity is the same number as the grid cell. D9 left Register out of that slice; this spec fills it. Does not supersede D9.

### `agent-os/specs/2026-08-23-2023-actual-categories-and-tags/`

- **Relationship:** Extends. Register views `?view=uncategorized` and `?view=tag&tag=` plus `clearViewState()` on mount are the deep-link pattern.

### `agent-os/specs/2026-08-24-1945-register-prepared-rows/`

- **Relationship:** Extends. Server-prepared index; Register page must not await `searchParams` (drawer `?detail=` would reload the ledger). Extra view params are client-read, like `tag`.

### `agent-os/specs/2026-08-26-2022-split-transactions/`

- **Relationship:** Extends. Split parents hold no envelope; children are the activity rows. The contributing set must exclude parents.

### `agent-os/specs/2026-07-31-1520-persistent-ui-state/`

- **Relationship:** Extends. Filters/sort/layout stay in `user_settings`. This view is named in the URL; it must not become the persisted default Register view.

### `agent-os/specs/2026-08-26-2159-grid-aggregation-placement/`

- **Relationship:** Not extended for behavior. Group-header Activity totals exist in the columns; this spec deliberately does not link them.

## Similar implementations

### Uncategorized and tag Register views

- **Location:** `src/lib/finances/registerQuery.ts` (`RegisterViewId`, `viewRows`), `src/components/finances/FinancesView.tsx` (`viewDefaults`, `clearViewState` on mount, empty copy), `src/components/finances/budget/BudgetView.tsx` (`?view=uncategorized`), `src/components/finances/tags/TagsView.tsx` (`?view=tag&tag=`).
- **Relevance:** The existing deep-link family. Activity is a third view with two extra params (`category`, `month`) the way tag has one.
- **Key patterns:** Client `useSearchParams` for extra params; server page does not await them; `viewRows` is the hard row set; chips explain it.

### Budget Activity cells and inspector

- **Location:** `src/components/finances/budget/budgetColumns.tsx` (Activity is a `<span>`), `src/components/finances/budget/BudgetInspector.tsx` (Activity `<dd>`), `src/components/finances/budget/BudgetView.tsx` (month key, column ctx).
- **Relevance:** Where the links go. Inspector D6: name tap opens the sheet; Activity must not.

### Activity contributing set

- **Location:** `src/lib/finances/budget/queries.ts` (`activitySince`), `src/lib/finances/categoryEligibility.ts` (`categoryAssignableIds`).
- **Relevance:** D3. Transfer/on-budget rules already exist in JS; SQL `activitySince` is the budget number. Prefer one shared predicate over a third copy.

## Actual Budget

- `docs/actual-budget/README.md` — semantics transfer, machinery does not.
- `../actual/packages/desktop-client/src/components/budget/index.tsx` — `onShowActivity`: navigate `/accounts` with `{ field: 'category', op: 'is', value: categoryId }` and `{ field: 'date', op: 'is', value: month, options: { month: true } }`.
- `../actual/packages/desktop-client/src/components/budget/envelope/EnvelopeBudgetComponents.tsx` — Spent cell `onClick` → `onShowActivity(category.id, month)`.
- `../actual/packages/loot-core/src/server/budget/base.ts` — which transactions count as monthly activity (on-budget filter).
