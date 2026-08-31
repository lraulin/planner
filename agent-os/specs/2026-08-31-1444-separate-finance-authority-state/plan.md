# Separate finance authority state

**Status: active**

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-29-0845-bank-snapshots-finance-audit/`
- **Extends:** `agent-os/specs/2026-08-29-1228-feed-ownership-watermark/`

This delta preserves those specs' browser-pending authority and feed-watermark semantics.
It corrects the data model used to represent them; it does not supersede either product
decision.

## Problem

`bank_account_links.scrape_balance_as_of` currently represents two independent facts:

1. a provisional posted balance supplied by a browser snapshot, or more recently by a
   checking CSV, which SimpleFIN must not overwrite while its balance lags; and
2. a complete browser snapshot whose pending set is authoritative for 36 hours.

On 2026-08-31, SimpleFIN caught up to Capital One's posted balance and correctly cleared
the provisional-balance hold. That same write accidentally revoked browser-pending
authority. Three still-pending transactions disappeared from Budget's selected working
set:

| Transaction | Category   |      Amount |
| ----------- | ---------- | ----------: |
| Pizza Hut   | Pizza      |      $12.71 |
| Potbelly    | Eating Out |      $19.48 |
| Walmart     | Groceries  |     $208.11 |
| **Total**   |            | **$240.30** |

The transactions remained stored. Dropping them from the working set made the three
categories appear to regain $240.30 of available funds.

The checking CSV import did not cause this incident: the loss occurred at 11:29:50 and
the CSV was imported later. Its recent headline-balance change did expose the same model
error, because a CSV provisional-balance hold can now masquerade as browser-pending
authority.

## Decisions

### D1 — Store the two facts separately

Rename `scrape_balance_as_of` to `provisional_balance_as_of` and its TypeScript field to
`provisionalBalanceAsOf`. Add nullable `browser_pending_as_of` /
`browserPendingAsOf`.

- `provisionalBalanceAsOf` controls only whether SimpleFIN may replace a newer posted
  `balanceCents` supplied by a browser snapshot or checking CSV.
- `browserPendingAsOf` controls only whether the latest complete browser pending set is
  authoritative.
- Keep separate 36-hour constants and predicates for the two concepts even though their
  current durations match. A later duration change must not silently recouple them.

### D2 — Each ingestion path owns only its facts

- A successful complete browser bank snapshot advances both timestamps.
- A checking CSV may advance `provisionalBalanceAsOf`, but never
  `browserPendingAsOf`.
- A SimpleFIN sync may clear or replace only `provisionalBalanceAsOf`. It never changes
  `browserPendingAsOf`.
- When SimpleFIN's posted balance catches up exactly, it clears the provisional hold while
  leaving browser pending authority intact.
- A browser authority timestamp need not be cleared. Freshness determines authority, and
  expiry automatically returns pending selection to SimpleFIN.

The existing feed watermark and handover rules remain unchanged.

### D3 — Name the domain rules in separate pure modules

Replace `scrapeBalance.ts` with a provisional-balance module and predicate. Add a separate
browser-pending-authority module and predicate. Budget working pending, bank-sync queries,
and the existing dashboard stale-snapshot warning all use the browser predicate.

`FinanceAccountRow.scrapeBalanceAsOf` becomes `browserPendingAsOf`. No external HTTP or
server-action contract otherwise changes, and this delta adds no new UI.

### D4 — Repair live authority from immutable audit evidence

The migration preserves every old timestamp by renaming the existing column. It adds
`browser_pending_as_of` and backfills each linked account from the latest successful
`bank_snapshot` finance-audit event that names the account in
`scope.accountIds`.

Use the audit event's `occurred_at`, not the migration time. A fresh event immediately
restores authority; an old event remains stored but is naturally inactive under the
36-hour predicate. Empty complete snapshots are valid authority evidence and are included.

### D5 — Audit authority changes explicitly

New normalized audit changes name `provisionalBalanceAsOf` and
`browserPendingAsOf`. Applying a successful browser snapshot must record the authority
transition even when no transaction or posted balance changed; it must not be presented as
a no-op when the selected pending source changed.

Historical audit events remain immutable.

## Acceptance criteria

- [ ] A browser snapshot followed by a same-balance SimpleFIN sync retains the three
      Capital One pending transactions and leaves Pizza, Eating Out, and Groceries
      unchanged by exactly $12.71, $19.48, and $208.11.
- [ ] The sync clears `provisionalBalanceAsOf` without changing
      `browserPendingAsOf`.
- [ ] Repeated browser snapshot, SimpleFIN sync, and checking CSV operations can run in any
      order without pending authority or posted balances oscillating.
- [ ] A CSV-only provisional balance does not suppress SimpleFIN pending transactions.
- [ ] The checking CSV headline fix still advances a lagged SimpleFIN balance and an older
      SimpleFIN value cannot walk it back during the hold.
- [ ] A complete empty browser snapshot remains authoritative until expiry; after expiry,
      SimpleFIN pending resumes automatically.
- [ ] The migration preserves provisional timestamps and backfills browser authority from
      the latest per-account bank-snapshot audit evidence without making old evidence
      fresh.
- [ ] Authority-only snapshot changes appear explicitly in finance audit history.
- [ ] Every database mutation remains scoped to `userId`, with a second user unable to
      read, change, or delete the first user's state.
- [ ] Unit and integration suites, lint, typecheck, build, dev-server smoke, and relevant
      end-to-end Budget verification pass.

## Implementation tasks

### Task 1: Save the active delta spec — done

Record the root cause, corrected model, live repair, acceptance criteria, governing
standards, and implementation references in this folder.

### Task 2: Correct the schema and migration — pending

Rename the legacy field, add browser authority, generate the Drizzle SQL/snapshot/journal,
and add the audit-based backfill. Read and exercise the migration against local Postgres.

### Task 3: Separate path ownership and audit evidence — pending

Move the two freshness rules into concept-specific modules. Update snapshot, SimpleFIN,
CSV, Budget, query, action, and dashboard consumers so each ingestion path mutates only its
owned state and audit normalization exposes both facts.

### Task 4: Add regressions — pending

Cover the exact $240.30 sequence, all meaningful path orderings, empty/expired browser
snapshots, CSV compatibility, migration backfill, and cross-user isolation with pure and
database tests.

### Task 5: Verify and freeze — pending

Run local migration and all project gates, start the app and run `npm run smoke`, verify
the Budget behavior end to end, update this spec to its as-built state, then freeze it.

## Changes from original plan

| #   | Change   | Why                             |
| --- | -------- | ------------------------------- |
| —   | None yet | Implementation has not started. |
