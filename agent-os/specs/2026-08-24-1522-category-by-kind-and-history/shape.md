# Category picker, payee auto-categorisation — Shaping Notes

**Status: active**

## Scope

- Group the Register Category dropdown by envelope kind.
- Add New {type}… in each group, with New bill… sharing the Track as bill write.
- File claimed payee charges (including history) when a claim is created or changed.
- Allow categorising transactions before the budget start month.
- Feed Average Spent / Spent Last Month from that history.
- Retire the user-configurable Rules system in the same cycle.
- Replace it with quiet, YNAB-style payee learning (`learn` / `fixed` / `off`).
- Keep envelope claims as a stronger, separate concept.
- Drop `derived_category`, the hard-coded taxonomy, and automatic taxonomy-to-envelope mapping. Keep bank `source_category` as provenance.

### Out of scope

- Folding pre-start months into Ready to Assign.
- A replacement custom-rule language, amount/keyword conditions, or a hidden Rules page.
- Catalog bulk-delete on the shared helper (Payees, Register, Accounts, Contacts, …). Recorded as a follow-up; removing Rules eliminates this instance there.
- Creating bills from BudgetStructureDrawer without a cadence.
- Shadow "user vs auto" Category columns.
- Tag-grouped additive totals or a relational tag join.
- Discarding imported bank `source_category` metadata.

## Decisions

- Track as bill, New bill…, Review, and Insights share `trackTransactionAsBill`. The agent tool and payee-claim picker still call `upsertBillEnvelope` / `replaceCommitmentPayees` → `applyClaimedPayees` with a known payee. Filing is DRY; no exact-payee rule is minted.
- Filing a bill's payee includes historical on-budget charges; other CVS payees stay unclaimed. Later manual corrections after the claim write are left alone. Releasing the claim does not rewrite history.
- Average Spent / Spent Last Month look at categorised spend before the start month. Average Assigned does not invent Assigned before start.
- Rules are YAGNI here. Actual ships a configurable engine because it is for everyone; this app is for one person. If a need appears, write the code.
- Auto-category follows current YNAB payee behaviour: first assignment learns; default changes on 2 of the latest 3; uncategorised occupy a slot but do not vote; old-window edits never change the default; previously categorised rows are never rewritten. Per-payee `fixed` and `off` live on Payees, not a global switch.
- Claims override the soft setting while held; the setting is preserved and resumes on release.
- One cohesive cutover: convert convertible unseeded exact-payee category-only rules, abort if a genuine custom rule cannot convert, drop seeded rules, infer remaining unclaimed defaults from history, then drop the table and the derived taxonomy.
- Four flow classifiers and canonical payee-name mappings move from starter rules into ordinary code so transfers, VA/interest/PayPal flow, payee identity, and income figures stay the same.

## Context

- **Visuals:** None. Assign's To picker already uses `<optgroup>` by section. YNAB Manage Payees is the behavioural reference, not a visual one.
- **References:** See `references.md`.
- **Product alignment:** Envelope budget analysis, first-month auto-assign, and quiet categorisation without an in-app rule language. Closes the Actual "Rules / Payees" follow-on in the opposite direction: Payees stay, Rules go.
- **Shaping session:** Codex `$shape-spec` 01a0366d-ccee-7331-b4b7-dafff5bf48d7. User chose "retire derived taxonomy, keep bank source category" and "one cohesive change."

## Standards Applied

See `standards.md`.
