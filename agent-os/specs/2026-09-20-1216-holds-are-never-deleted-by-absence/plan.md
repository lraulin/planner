# Holds are never deleted by absence

**Status: active**
Spec folder: `agent-os/specs/2026-09-20-1216-holds-are-never-deleted-by-absence/`

## Spec relationships

- **Supersedes:** `2026-09-13-1127-ingest-by-identity` **D3a** — "the bank-page capture is the
  authority for its own pending set; a hold the page no longer lists is removed on the next run."
  Absence alone stops authorizing removal. **D3b** survives and gets a larger candidate pool.
  D1, D2, D4, D5 are untouched.
- **Extends:** `2026-08-29-0845-bank-snapshots-finance-audit` (snapshot format, audit evidence).
- **Extends:** `2026-09-14-1004-ledger-ready-to-assign` D4 (the page never authors posted history
  for a feed-covered account). D2 below relies on it.
- **Extends:** `2026-08-15-1315-live-bank-sync` (SimpleFIN's pending delete).

## Context

On 2026-09-20 a Capital One paste removed the pending Chewy.com $51.29 hold ("no posted row could
be confirmed as its successor") although it was on the page. The statement had closed that
morning; Chewy posted Sep 19 and moved into the "Statement Ending Sep 20, 2026" table.

1. `capitalone-pending.user.js:126-132` reads only `Pending Transactions` and `Posted
Transactions Since Your Last Statement`; statement tables are skipped at `:139`.
2. `:216-217` tests `/no (?:posted |recent )?transactions/i` against the whole page, so "There are
   no transactions since your last statement" made `postedKnown` true with zero rows read. The
   snapshot asserted `posted: true`, `currentCycle: true`, `"posted": []`.
3. `bankSnapshot.ts:348-368` accepts that as a truthful empty cycle.
4. `bankSnapshotReconcile.ts:389` → `resolveLostHold` searches stored posted rows only. SimpleFIN
   had not delivered the Sep 19 postings, so `none`.
5. `:408` → hard `DELETE` (`bankSnapshotApply.ts:570-581`), no carry. $51.29 returned to Ready to
   Assign; SimpleFIN will re-insert it later without the envelope.

The matcher was not involved. The wrong assumption is that **a source may authorize deletions in
a region of history it cannot see, irreversibly.** See `shape.md` for evidence.

## Decisions

### D1: A capture asserts completeness only for a region it read

In `capitalone-pending.user.js`, `postedKnown` requires the "Posted Transactions Since Your Last
Statement" table to exist and be non-empty or carry its empty message **inside its own subtree**;
no whole-document regex. Same for `pendingKnown` (`:218-219`). `incompletePagination`, `filtered`
and `searched` (`:175-200`) are scoped to the current-cycle region. Audit `chase-pending.user.js`
(`completeness`, `:314-333`) for the same reading and fix what it finds. A capture that cannot
establish the current cycle refuses.

### D2: The closed statement is successor evidence, never history

New **optional** top-level `recentPosted` array (rows of the most recent `Statement Ending` table)
with that statement's close date, plus `completeness.recentPosted`. `version` stays 1; the key is
optional so Chase and older pastes still parse (`TOP_LEVEL_KEYS`, `bankSnapshot.ts:86-96`).

Rows are **evidence only** — never inserted, never counted as posted history. They feed exactly:

- the `sameEvent` successor scan (`bankSnapshotReconcile.ts:267-304`), so a hold that posted into
  the closed statement is marked `postedAtBankMarks` instead of lost;
- `resolveLostHold`'s candidate pool (`feedPairing.ts:125-147`).

Deploy order: app first, then the userscript (the parser rejects unknown keys).

### D3: A hold is never removed by absence alone

The `outcome: "none"` branch (`bankSnapshotReconcile.ts:407-412`) keeps the row with its envelope,
notes and flow, and sets a new nullable `finance_transactions.unlisted_at timestamptz`, modelled on
`postedAtBank` (`schema.ts:2207-2216`). It behaves like the existing `ambiguous` branch. The flag
clears when a successor pairs, via the retirement pass that already runs on every sync and import.
The warning is reworded to kept-and-flagged. Unlisted holds are surfaced in the register and on the
Accounts page with a one-click resolve (confirm gone → audited delete). **No auto-expiry**: a
flagged hold waits for Lee. Accepted cost: the duplicate-hold case D3a existed for now lingers
visibly until resolved. Direction of error stays with the visible duplicate.

### D4: An ingestion deletion is restorable

`finance_audit_changes.before_fields` keeps the full row, and `entity_identity` outlives it
(`schema.ts:2949-2974`). Add a restore action on `/finances/activity?event=<id>` that re-inserts
from `before_fields` with its own audit event. Before inserting it runs the existing pairing check
and **refuses with an explanation** if a successor has since arrived. `userId` on every query and
mutation.

### D5: SimpleFIN's pending→posted delete carries state and obeys D3

`syncPlan.ts:176-188` / `mutations.ts:386-400` delete a vanished stored hold and carry nothing, so
category, notes and `flowOverride` are dropped whenever a SimpleFIN hold posts. With a successor
identified, carry `carryableFields` onto it via `feedPairing.ts`. Without one, apply D3. The
successor-present delete stays, so the double-count guard at `syncPlan.ts:11-16` holds. One rule,
both pipelines.

## Tasks

1. **Recover Chewy first.** Restore the row and envelope from the 2026-09-20 audit event
   (`before_fields`). Never re-enter by hand. Do this before or as the first use of D4.
2. D1 — completeness scoping, both scripts.
3. D2 — `recentPosted` through the script, parser, and the two evidence sites.
4. D3 — `unlisted_at` column and migration, reconcile branch, clear-on-pair, UI and resolve action.
5. D4 — restore from audit with the duplicate refusal.
6. D5 — SimpleFIN carry and D3 conformance.

## Acceptance criteria

- [ ] **Replay:** the 2026-09-20 snapshot (`rawText` on the audit event) through the new planner
      keeps the Chewy hold. With the statement rows added it is marked `postedAtBank`.
- [ ] A capture whose posted table is absent or unreadable refuses; tested against saved HTML of
      the statement-close page.
- [ ] Unit: `resolveLostHold` with `recentPosted` candidates; the `none` branch sets `unlisted_at`
      and deletes nothing.
- [ ] Integration: snapshot apply, sync apply, restore and resolve each with a second user who
      fails to read, change and delete the first user's row.
- [ ] No React component tests. `npm run smoke` after touching `src/app/**`.
- [ ] `npm test` with no database skip warning.

## Follow-ups (not in this spec)

- A balance-identity guard: refuse or warn when the projected register balance disagrees with the
  capture's own `currentBalance`.
- Whether the alias table in `descriptionsOverlap` should be replaced by something structural.

## Changes from original plan

| #   | Change | Why |
| --- | ------ | --- |
