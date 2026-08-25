# References for Category picker and payee auto-categorisation

**Status: frozen / complete** (2026-08-24)

## Governing specs

### `agent-os/specs/2026-08-24-0930-envelope-sections/`

- **Relationship:** Extends — `kind` is the section. Bills still need a cadence, so New bill… reuses Track as bill rather than `createBudgetCategory`.

### `agent-os/specs/2026-08-23-2313-one-budget/`

- **Relationship:** Extends D3 — the payee claim is the hard envelope relationship. This spec **renames** `finance_payees.budget_category_id` to `claimed_budget_category_id` and adds a separate learned/fixed default. Reconciled in that active spec: ingest no longer runs rules or the taxonomy auto-map; historical rewrite stays on the claim-write path.

### `agent-os/specs/2026-08-23-2023-actual-categories-and-tags/`

- **Relationship:** Extends the Category-is-envelope-UUID and tags decisions. **Supersedes** decisions 3 (later-match-wins rule composition), 4 (3-of-latest-5 learning that minted exact-payee rules), and 8 (unresolved-legacy-rule review). Completes that spec's follow-up to remove leftover taxonomy storage.

### `agent-os/specs/2026-08-23-1536-finance-rules/`

- **Relationship:** **Supersedes** the whole user-facing engine: `finance_rules`, seeding, editor, Run rules, Create rule from transaction, and rule-driven category/tag/flow/name-payee actions. The four flow-bearing starter rules and canonical `merchant` names are extracted into ordinary code so D5 precedence for _flow_ (transfer > named flow > cadence > sign) is preserved without a table.

### `agent-os/specs/2026-08-23-0748-finance-payees/`

- **Relationship:** Extends identity, aliases, and merge. Auto-learned category rules were out of scope there; they land here as payee columns rather than a later Rules engine.

### `agent-os/specs/2026-08-24-1311-budget-assign-options/`

- **Relationship:** Extends — Average Spent / Spent Last Month currently read only folded months; this spec opens pre-start categorised activity.

### `agent-os/specs/2026-08-21-1810-register-track-as-bill/`

- **Relationship:** Extends — the confirm dialog and `upsertBillEnvelope` stay; filing is part of that write; the exact-payee rule is not.

### `agent-os/specs/2026-08-24-1945-register-prepared-rows/`

- **Relationship:** Does not supersede virtualization. Register reload loses the **Run rules** trigger.

## Similar implementations

### Assign To picker

- **Location:** `src/components/finances/budget/AssignDialog.tsx`
- **Relevance:** `<optgroup>` by Bills / Regular spending / Savings.

### Track as bill confirm

- **Location:** `src/components/finances/TrackAsBillDialog.tsx` → `trackTransactionAsBill`
- **Relevance:** the UI New bill… must open, not a second form.

### Payee claim filing

- **Location:** `src/lib/finances/payees/claims.ts` `applyPayeeClaims` / `applyClaimedPayees`
- **Relevance:** files claimed charges; must stop minting `upsertPayeeCategoryRule`.

### Current learning

- **Location:** `src/lib/finances/categoryLearning.ts` — Actual 3-of-latest-5.
- **Relevance:** replaced by YNAB 2-of-latest-3, first-use immediate, uncategorised-as-slot.

### YNAB auto-categorisation

- **Location:** https://support.ynab.com/en_us/categorizing-transactions-a-guide-HyRl60sks
- **Relevance:** first assignment; 2 of latest 3; new transactions only; per-payee default / do-not-auto-categorize. Envelope claims are this app's extra.

### Catalog delete helper (follow-up, not this spec)

- **Location:** `src/components/grid/catalogCommands.ts` — `run: () => selection.id && onDelete(selection.id)` while the chip shows `selection.count`.
- **Relevance:** the reported Rules bulk-delete failure. Same pattern on Payees, Register, Accounts, Contacts, Resources, Jobs, Residences, Time Charts, Metrics, Timeline.

### Flow-bearing starter rules to extract

- **Location:** `src/lib/finances/rules/starterRules.ts` ids `interest-charged`, `interest-earned`, `va-benefits`, `paypal-outbound`, plus every `merchant:` canonical name.
- **Relevance:** D10. Category-setting starters are not extracted; they die with the table.
