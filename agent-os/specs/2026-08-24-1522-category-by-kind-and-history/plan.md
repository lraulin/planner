# Category picker by kind, payee auto-categorisation, and historical filing

**Status: active**  
Spec folder: `agent-os/specs/2026-08-24-1522-category-by-kind-and-history/`

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-24-0930-envelope-sections/` — sections come from `kind`. Creating a bill still needs a cadence; this spec adds the create-from-transaction path the structure drawer cannot offer.
- **Extends:** `agent-os/specs/2026-08-23-2313-one-budget/` D3 — a payee claim still means "this merchant's charges belong to this envelope." The column is renamed to `claimed_budget_category_id`; the meaning is unchanged. Claims remain stronger than learned/fixed defaults.
- **Extends:** `agent-os/specs/2026-08-23-2023-actual-categories-and-tags/` — `finance_transactions.budget_category_id` remains the Category; tags stay Notes tokens. Learning and rule composition are superseded below.
- **Extends:** `agent-os/specs/2026-08-24-1311-budget-assign-options/` — Average Spent / Spent Last Month read activity history.
- **Extends:** `agent-os/specs/2026-08-21-1810-register-track-as-bill/` — Track as bill stays; filing the claimed payee is part of the same write. The exact-payee rule that write used to mint is gone.
- **Extends:** `agent-os/specs/2026-08-23-0748-finance-payees/` — payee identity, aliases, and merge stay. Auto-category lives on the payee row instead of in a rules table.
- **Supersedes:** `envelopeAssignmentRefusal`'s date branch — pre-start rows may hold a Category. Off-budget accounts still cannot.
- **Supersedes:** `applyPayeeClaims` / `upsertBillEnvelope` as implemented, where a new bill claimed the payee but never filed charges (especially before the start month).
- **Supersedes:** `agent-os/specs/2026-08-23-1536-finance-rules/` — the user-owned rules table, editor, first-match / later-match engine, seeding of the 65 regexes, **Run rules**, **Create rule from this transaction**, and rule-driven category/tag/flow/name-payee actions. Flow classifiers and canonical payee names that those seeded rules encoded move into ordinary code. No replacement custom-rule language is built.
- **Supersedes:** `agent-os/specs/2026-08-23-2023-actual-categories-and-tags/` decisions 3, 4, and 8 — later-match-wins rule composition, Actual 3-of-latest-5 learning that minted exact-payee rules, and unresolved-legacy-rule review. Decision 1 (envelope UUID is the Category, no shadow override column) and decision 2 (tags) carry forward. Decision 5 (on-budget transfers have no category) carries forward.
- **Supersedes:** this spec's original D3 rule mint, D6 (dead rule targets), and D7 (ingest applies claims after rules).
- **Does not supersede:** envelope arithmetic, Ready to Assign, or the start-month opening position. Pre-start activity still does not enter the fold.
- **Does not supersede:** `agent-os/specs/2026-08-24-1945-register-prepared-rows/` except that Register reload no longer has a **Run rules** trigger.

## Context

The Category cell was a flat list. Track as bill created a bill envelope and claimed the payee, then stopped — ExtraCare still looked uncategorised, the broad seeded `cvs` (`/^CVS/`) still matched `CVSEXTRACARE`, and history before the budget start could not be filed. Average Spent / Spent Last Month therefore had nothing to read in the first budget month.

That filing gap is closed. What remains is the **Rules page**: leftover Actual generality. The seeded corpus maps to taxonomy categories that no longer exist as envelopes; bulk-delete on that catalog is broken (the shared helper shows `N selected` and deletes the focused row); and the user does not want an in-app rule language. YNAB has no Rules section. Categorisation should be quiet payee behaviour: assign a few times, then stop assigning. Defining a bill is the stronger, explicit act that files that merchant.

The bulk-delete defect also exists on other catalog screens. Removing Rules eliminates this instance. The shared helper is a **follow-up**, not part of this finance-model change.

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

**D3 — One Track-as-bill write, every entry point.** Register row menu, Category **New bill…**, Review, and Insights one-off call `trackTransactionAsBill`: load the user-owned transaction, mint or isolate its payee, then `upsertBillEnvelope` with that payee. Agent `upsert_bill_envelope` and the payee-claim picker continue through `upsertBillEnvelope` / `replaceCommitmentPayees` directly — they already hold a known payee. Both paths file every on-budget eligible charge of the claimed payees (no start-month bound). They do **not** mint a rule. The browser must not compose `isolatePayeeForBill` and `setRecurringBill` itself.

**D4 — Category is allowed before the budget start.** `envelopeAssignmentRefusal` keeps only the off-budget reason. Pre-start Category is analysis data. Ready to Assign, Assigned, and in-budget Activity still ignore those rows. The Budget uncategorized count still counts only on-budget rows since the start month.

**D5 — Spent Last Month / Average Spent read categorised activity before the start month.** Up to 12 prior calendar months. Average Assigned / Assigned Last Month stay inside the budget window.

**D6 — Retire Rules.** Delete `finance_rules`, the `/finances/rules` route and nav entry, the editor, actions, **Create rule from transaction**, **Run rules**, rule seeds, and rule audit machinery. `/finances/rules` resolves as not found. No public generic rule API replaces the engine.

**D7 — Payee auto-category is YNAB-shaped, claims are stronger.**

On `finance_payees`:

- Rename `budget_category_id` → `claimed_budget_category_id`. Still the hard envelope relationship for bills and other envelope-owned payees.
- Add `default_budget_category_id` (nullable) and `auto_category_mode` (`learn` | `fixed` | `off`). Default mode is `learn`.
- Drop `learn_categories`; mode replaces it.

A claim **overrides** the soft setting while it is held. The saved mode and default are preserved and resume if the claim is released. Releasing a claim does not rewrite existing transactions.

Apply a Category to **new or currently uncategorised eligible** transactions, in this order:

1. Existing / manual Category
2. Payee envelope claim
3. Payee learned or fixed default (`learn` or `fixed`, and a default is set)
4. Uncategorised

`off` leaves new transactions uncategorised. `fixed` supplies the chosen default to new transactions and still allows per-row corrections. Neither mode rewrites a previously categorised row.

Learning (`learn`):

- Learns immediately from the first manual Category assignment.
- Changes the default when a different Category appears on at least two of the latest three eligible transactions.
- Counts uncategorised rows as positions in that window, not as votes.
- Ignores edits outside the latest-three window.
- Never rewrites previously categorised transactions.

Creating or changing a claim intentionally files all matching historical on-budget eligible charges into that envelope, then categorises future charges. Later manual corrections stay. Off-budget accounts are never filed.

YNAB reference: [Categorizing transactions](https://support.ynab.com/en_us/categorizing-transactions-a-guide-HyRl60sks). Envelope claims are this app's explicit stronger behaviour, which YNAB does not have.

**D8 — Payees is the only auto-category surface.** Columns: **Auto Category** and **Envelope** (the claim; rename the current Commitment column). Modes in the grid/drawer: `Learn from my choices`, `Use a fixed default`, `Do not auto-categorize`. Learning mode shows the current learned Category and lets it be changed or cleared. Claimed payees disable those controls, with copy that the saved setting resumes if released. One user-scoped mutation changes mode/default.

**D9 — Migration converts what it can and aborts what it cannot.** One cohesive cutover, not two releases:

1. Convert unseeded, exact-payee, category-only rules into that payee's default (`fixed` if the rule was the user's explicit setter; otherwise a learned default).
2. If any genuine unseeded custom rule cannot convert safely, **abort** and report the rule names. Do not drop the table.
3. Drop seeded legacy rules.
4. For remaining unclaimed payees, infer defaults from history: a Category on at least two of the latest three eligible transactions, or the sole Category when only one categorised transaction exists. Leave ambiguous payees unset, mode `learn`.
5. Preserve every transaction envelope Category, existing note tags, payees, and aliases.
6. Drop `finance_rules`, `derived_category`, the hard-coded taxonomy (`FINANCE_CATEGORIES` / `categoryFromBank`), `source_categories` envelope mappings, and automatic taxonomy-to-envelope mapping (`autoMap`).
7. Keep imported bank `source_category` as provenance only. It must not influence categorisation.

**D10 — Flow and payee identity leave the rule file as ordinary code.** Extract the four seeded flow classifiers (`interest-charged`, `interest-earned`, `va-benefits`, `paypal-outbound`) and the starter `merchant` canonical names into focused modules. Transfer detection, payee resolution, interest/VA/PayPal flow, and income calculations stay behaviour-identical. Rule-driven Category and tag actions retire. Tags remain for manual use.

**D11 — Envelope deletion and payee merge.** Deleting an envelope clears matching claims and defaults in the same transaction. A deleted `fixed` default falls back to `learn` with no current default. Merges keep the **target** payee's claim and auto-category configuration. Conflicting claims still block. Learned/default differences do not. A target in `learn` relearns from the merged history.

**D12 — Ingest no longer runs rules.** `finalizeTransactionIngestion`: ensure payees → reclassify flow/identity → apply claim then default to **new/uncategorised eligible** rows created in that ingest. Unbounded historical rewrite happens only on the claim-write path (D3).

## Acceptance criteria

- [ ] Register and transaction-drawer Category lists are grouped Income / Bills / Regular spending / Savings.
- [ ] Each group has New {type}…; New bill… opens the same Track as bill confirm.
- [ ] Every Track as bill / New bill / Review / agent / claim-picker path files that payee's on-budget charges (including pre-start) into the claimed envelope. Other CVS / CVS/PHARMACY payees are not claimed by an ExtraCare bill.
- [ ] Pre-start on-budget rows can be categorised; off-budget rows still cannot.
- [ ] Budget Uncategorized count and in-budget Activity still ignore pre-start rows.
- [ ] Average Spent / Spent Last Month use pre-start categorised spend (up to 12 months).
- [ ] `/finances/rules` is absent from nav, menus, command surfaces, and direct routing (not found).
- [ ] Payees shows Auto Category and Envelope; modes work; claimed payees disable the controls with the resume explanation.
- [ ] First assignment learns; 2-of-latest-3 changes the default; uncategorised slots do not vote; old-window edits do not; previously categorised rows are never rewritten.
- [ ] Fixed / off modes behave as D7. Claim beats default. Ingest applies only to new/uncategorised eligible rows.
- [ ] Migration converts convertible unseeded exact-payee category rules, infers remaining defaults, drops seeded rules, and aborts naming any non-convertible custom rule.
- [ ] Envelope deletion clears claims/defaults; a deleted fixed default becomes learn with no default.
- [ ] Payee merge keeps the target's claim and auto-category; conflicting claims still block; learn-mode targets relearn.
- [ ] Flow, transfers, payee identity, payday statistics, and income summaries are unchanged vs the last rules-backed run; only retired taxonomy/tag automation may differ.
- [ ] Second user cannot read/change/delete the first user's payees, categories, or transactions on the new writes.
- [ ] lint, typecheck, test:unit and non-skipped database tests (Postgres up), production build, smoke on a running dev server. Driven in the browser at desktop and 390×844, light and dark.

## Changes from original plan

| #   | Change                                                                                                    | Why                                                                                                                                                           |
| --- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | D3 is the single write path: `applyClaimedPayees` after every claim, not a Track-as-bill-only side effect | Review comment: DRY — Track as bill by any name must execute the same code                                                                                    |
| 2   | Track as bill / New bill… mint a payee from the merchant on confirm when `payee_id` is null               | The Payee column already shows the merchant; refusing "Reclassify first" blocked the flow. A full-ledger reclassify plus unbounded claims froze the Register. |
| 3   | Ingest `applyPayeeClaims` is bounded to rows created in that ingest                                       | Unbounded scan on every import/sync was a second way to lock the page                                                                                         |
| 4   | Track as bill isolates this merchant onto its own payee when the current payee also owns other aliases    | Seeded `/^CVS/` had named ExtraCare's payee "CVS", so a bill would have claimed 211 pharmacy charges                                                          |
| 5   | Transaction-backed entry points call one `trackTransactionAsBill` mutation                                | Register, New bill…, Review, and Insights were composing isolate + upsert in the browser; Insights still refused `payeeId === null` independently             |
| 6   | A payee already named for the merchant stays intact when it has multiple aliases                          | Alternate statement spellings are one payee, not proof of the shared-identity case that requires isolation; splitting tried to create a duplicate payee       |
| 7   | Retire Rules; replace with YNAB-style payee auto-category (D6–D12). Claims stay the stronger override.    | The Rules page is leftover Actual generality. Dead taxonomy targets made it unusable; bulk-delete was broken; the user does not want an in-app rule language. |
| 8   | Drop `derived_category`, hard-coded taxonomy, and automatic envelope mapping in the same cutover          | One cohesive change. Bank `source_category` stays as provenance only.                                                                                         |
| 9   | Catalog bulk-delete (focused row vs selection count) is a follow-up, not this spec                        | Removing Rules eliminates this instance; expanding into the shared catalog helper would mix a grid bug with a finance-model change                            |

## Task 1: Save spec documentation

This folder, plus the one-budget reconciliation.

## Task 2: Grouped picker + New {type}…

## Task 3: Single claim write — file charges (no rule)

## Task 4: Historical Category + assign lookback

## Task 5: Payee model, migration, retire taxonomy and Rules

Schema, guarded cutover, drop `finance_rules` and derived taxonomy. Abort naming non-convertible custom rules.

## Task 6: Categorisation behaviour

Learning / fixed / off, claim precedence, ingest new-only, flow classifiers and canonical payee names as ordinary code.

## Task 7: Payees UI and Rules removal

Columns, drawer, mutation, nav/route contracts.

## Task 8: Verify, freeze spec, update roadmap

- Confirm acceptance criteria.
- Update plan/shape for any material as-built drift; complete **Changes from original plan**.
- Mark files **Status: frozen / complete** (date); list follow-ups as new work (including catalog bulk-delete).
- Update `agent-os/product/roadmap.md`: Rules shipped line becomes retired; Categories learning/rules composition notes this delta.

> While this spec is **active**, when we make a material change to requirements, design, or scope (including from feedback on what was implemented), update the relevant sections and append to **Changes from original plan**. Skip pure implementation details. Freeze when verified.
