# Shaping — Finances CSV import + register

**Status: frozen / complete** (2026-08-12)  
Authoritative as-built detail: `plan.md` (including **Changes from original plan**).

## The ask (refined)

Start the Finances module. MVP is narrow: **get two years of real transaction history into
the database and be able to look at it.** Everything else — envelopes, categorization,
goal linkage, Plaid — comes later, and this schema should not block any of it.

## Scope

Import Chase credit, Capital One card, and Capital One 360 Checking/Savings CSV exports;
store them under auto-created accounts; browse them in a register built on the shared grid;
edit a transaction's category and notes; delete a transaction.

### Out of scope

Envelopes and budgeting, categorization rules, transfer matching, splits, reconciliation,
reports and charts, multi-currency, goal linkage, and any API feed including Plaid.

## Decisions

1. **Two tables only** — accounts and transactions. A categories table was considered and
   rejected as speculative: nothing in the MVP edits a taxonomy, and the right shape will be
   obvious after living with real data.
2. **Bank category kept verbatim, user category separate.** `sourceCategory` is what the
   bank said and is never overwritten; `category` is nullable and yours. Keeping them apart
   is what lets re-import be safe without a merge rule.
3. **Accounts auto-create.** The importer derives an account key from the file and creates
   the account on first sight, matching it thereafter. Zero setup before data lands; rename
   afterward. The alternative — declare accounts, then pick one per upload — puts four
   forms in front of the first useful screen.
4. **One sign rule: positive is money into the account.** Uniform across bank and card, so
   sums and balances need no per-account-kind branch.
5. **Dedup fingerprint carries an occurrence ordinal.** Discovered from the data: the
   Capital One card file contains two byte-identical SBARRO rows. Any key over
   date+description+amount alone collapses them, and the loss is invisible.
6. **Re-import never updates.** Insert-or-skip only. This is what makes user edits durable
   without a field-level merge policy.
7. **The register rides the shared `DataGrid`.** Initially planned as a purpose-built table
   on the mistaken belief that `DataGrid` was hardwired to `OutlineNode`; it is
   `DataGrid<TCtx, TRow = OutlineNode>`, and `src/components/resources/` already proves the
   flat-module pattern. `components/data-grid.md` requires this anyway.
8. **Provenance is feed-agnostic.** `(externalSource, externalId)` and an opaque account
   `externalKey`, so a later Plaid or SimpleFIN sync is a new source string rather than new
   tables.
9. **Beyond Achieve.** Achieve Planner had no finance module, so nothing in
   `docs/achieve-planner/` governs this and no fidelity argument applies.

## Context

- **Visuals:** none.
- **References:** see `references.md`.
- **Product alignment:** partially delivers roadmap § Financial planning (CSV import +
  register; envelopes outstanding). Honours the roadmap's "link into nodes/goals rather than
  forking a second hierarchy" constraint.

## Open question carried forward

Whether Plaid is usable free for personal use is **unverified** — Plaid retired its old free
Development environment and moved to limited free usage on Production, and the terms have
moved more than once. Confirm against current pricing before planning that work. Nothing in
this spec depends on the answer.
