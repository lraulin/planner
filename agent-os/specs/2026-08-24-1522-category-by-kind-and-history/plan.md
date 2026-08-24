# Category picker by kind, new envelopes, rules, and historical categorisation

**Status: active**
Spec folder: `agent-os/specs/2026-08-24-1522-category-by-kind-and-history/`

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-24-0930-envelope-sections/` — sections come from `kind`. Creating a bill still needs a cadence; this spec adds the create-from-transaction path the structure drawer cannot offer.
- **Extends:** `agent-os/specs/2026-08-23-2313-one-budget/` D3 — `finance_payees.budget_category_id` means "this merchant's charges belong to this envelope" and beats a broad rule.
- **Extends:** `agent-os/specs/2026-08-23-2023-actual-categories-and-tags/` — `budget_category_id` is the Category; later matching rules win per field; new rules append at the end.
- **Extends:** `agent-os/specs/2026-08-24-1311-budget-assign-options/` — Average Spent / Spent Last Month read activity history.
- **Extends:** `agent-os/specs/2026-08-21-1810-register-track-as-bill/` — Track as bill stays; filing and a payee rule become part of the same write.
- **Supersedes:** `envelopeAssignmentRefusal`'s date branch — pre-start rows may hold a Category. Off-budget accounts still cannot.
- **Supersedes:** `applyPayeeClaims` / `upsertBillEnvelope` as implemented, where a new bill claimed the payee but never filed charges (especially before the start month).
- **Does not supersede:** envelope arithmetic, Ready to Assign, or the start-month opening position. Pre-start activity still does not enter the fold.

## Context

The Category cell is a flat list. Track as bill creates a bill envelope and claims the payee, then stops — so ExtraCare still looks uncategorised, the broad seeded `cvs` (`/^CVS/`) still matches `CVSEXTRACARE`, and history before August 2026 cannot be filed at all. Average Spent / Spent Last Month therefore have nothing to read in the first budget month.

**Rules are still in use.** They run on import and on **Run rules**. Category learning can mint an exact-payee rule. The missing piece is that Track as bill never wrote one, and payee claims were not applied to `budget_category_id` on that path.

## Decisions

**D1 — Group the Category picker by section.** Income, Bills, Regular spending, Savings. Empty groups still render so **New …** is reachable.

**D2 — Each group ends with New {type}…**

| Group            | Command       | What it creates                              |
| ---------------- | ------------- | -------------------------------------------- |
| Income           | New income…   | `kind: "income"` envelope, assign this row   |
| Bills            | New bill…     | The Track as bill write (D3)                 |
| Regular spending | New envelope… | `kind: "spending"` envelope, assign this row |
| Savings          | New savings…  | `kind: "savings"` envelope, assign this row  |

New income / envelope / savings: name, then `createBudgetCategory` + `setTransactionBudgetCategory`. Do not claim the payee.

**D3 — One Track-as-bill write, every entry point.** Register row menu, Category **New bill…**, Review, Insights one-off, agent `upsert_bill_envelope`, and the payee-claim picker all end in `upsertBillEnvelope` / `replaceCommitmentPayees` plus `applyClaimedPayees`. That helper files every on-budget charge of the claimed payees (no start-month bound) and upserts a `payee is` + set-category rule at the end of the list (later-match-wins beats `/^CVS/`). Do not grow a second filing path for any of those labels.

**D4 — Category is allowed before the budget start.** `envelopeAssignmentRefusal` keeps only the off-budget reason. Pre-start Category is analysis data. Ready to Assign, Assigned, and in-budget Activity still ignore those rows. The Budget uncategorized count still counts only on-budget rows since the start month.

**D5 — Spent Last Month / Average Spent read categorised activity before the start month.** Up to 12 prior calendar months. Average Assigned / Assigned Last Month stay inside the budget window.

**D6 — Rules keep later-match-wins.** A dead category UUID in a rule action is skipped at apply time and the rule is marked `categoryReviewRequired`.

**D7 — Ingestion applies payee claims after rules.** `finalizeTransactionIngestion` matches its own comment: payees → rules (new rows) → claims.

## Acceptance criteria

- [ ] Register and transaction-drawer Category lists are grouped Income / Bills / Regular spending / Savings.
- [ ] Each group has New {type}…; New bill… opens the same Track as bill confirm.
- [ ] Every Track as bill / New bill / Review / agent / claim-picker path files that payee's on-budget charges (including pre-start) and upserts a payee-is rule that beats `/^CVS/`.
- [ ] Other CVS / CVS/PHARMACY payees are not claimed by an ExtraCare bill.
- [ ] Pre-start on-budget rows can be categorised; off-budget rows still cannot.
- [ ] Budget Uncategorized count and in-budget Activity still ignore pre-start rows.
- [ ] Average Spent / Spent Last Month use pre-start categorised spend (up to 12 months).
- [ ] A rule whose category UUID is missing does not fail the apply pass; it is flagged for review.
- [ ] Second user cannot read/change/delete the first user's rows on the new writes.
- [ ] lint, typecheck, test:unit (Postgres up), smoke on a running dev server. Driven in the browser.

## Changes from original plan

| #   | Change                                                                                                    | Why                                                                        |
| --- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 1   | D3 is the single write path: `applyClaimedPayees` after every claim, not a Track-as-bill-only side effect | Review comment: DRY — Track as bill by any name must execute the same code |

## Task 1: Save spec documentation

This folder.

## Task 2: Grouped picker + New {type}…

## Task 3: Single claim write — file charges + payee rule

## Task 4: Historical Category + assign lookback

## Task 5: Dead rule targets

## Task 6: Verify, freeze spec, update roadmap
