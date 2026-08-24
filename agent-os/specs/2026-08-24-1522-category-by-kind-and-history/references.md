# References for Category picker by kind

## Governing specs

### `agent-os/specs/2026-08-24-0930-envelope-sections/`

- **Relationship:** Extends — `kind` is the section. Bills still need a cadence, so New bill… reuses Track as bill rather than `createBudgetCategory`.

### `agent-os/specs/2026-08-23-2313-one-budget/`

- **Relationship:** Extends D3 — the payee claim is supposed to beat a broad category rule. `finalizeTransactionIngestion` already comments this order and does not do it.

### `agent-os/specs/2026-08-23-2023-actual-categories-and-tags/`

- **Relationship:** Extends — later-match-wins, new rules append, Category is `budget_category_id`.

### `agent-os/specs/2026-08-24-1311-budget-assign-options/`

- **Relationship:** Extends — Average Spent / Spent Last Month currently read only folded months.

### `agent-os/specs/2026-08-21-1810-register-track-as-bill/`

- **Relationship:** Extends — the confirm dialog and `upsertBillEnvelope` stay; filing becomes part of that write.

## Similar implementations

### Assign To picker

- **Location:** `src/components/finances/budget/AssignDialog.tsx`
- **Relevance:** `<optgroup>` by Bills / Regular spending / Savings.

### Track as bill confirm

- **Location:** `src/components/finances/TrackAsBillDialog.tsx` → `setRecurringBillAction` → `upsertBillEnvelope`
- **Relevance:** the UI New bill… must open, not a second form.

### Payee claim filing

- **Location:** `src/lib/finances/budget/mutations.ts` `applyPayeeClaims`
- **Relevance:** already files claimed charges, but bounded by the start month and not called from Track as bill.
