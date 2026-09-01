# Source currency: every ingestion path carries an as-of, and the freshest one wins

**Status: frozen / complete**
Spec folder: `agent-os/specs/2026-09-01-1205-source-as-of-authority/`

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-29-1228-feed-ownership-watermark/` — D1–D4 carry
  forward unchanged. Row ownership by feed watermark, the retirement of the browser tail,
  and the carry-over of user-owned state across a handover are not touched by this delta.
- **Extends:** `agent-os/specs/2026-08-15-1315-live-bank-sync/` — SimpleFIN remains the
  historical/reconciliation source and linked accounts remain existing account rows.
- **Extends:** `agent-os/specs/2026-08-29-0845-bank-snapshots-finance-audit/` — the
  versioned complete-snapshot contract, atomic application, and the append-only finance
  audit all carry forward.
- **Supersedes:** `agent-os/specs/2026-08-29-0845-bank-snapshots-finance-audit/` D2,
  narrowly — the **36-hour browser-pending authority window**. Pending authority is now
  decided by comparing as-of stamps, not by elapsed time since capture. The rest of D2
  (atomic reconciliation, posted transitions, split preservation) is unchanged.
- **Supersedes:** `agent-os/specs/2026-08-31-1444-separate-finance-authority-state/` D1, D2
  and D3 — the `provisional_balance_as_of` / `browser_pending_as_of` columns, the rules for
  which path clears which, and the two elapsed-time predicates and their modules. D4's
  principle of backfilling live authority from immutable audit evidence and D5's explicit
  auditing of authority changes both carry forward.

## Context

Three sources write the same account: a SimpleFIN sync, a browser bank snapshot, and a
CSV/statement import. Lee's workflow alternates them deliberately and nothing is ever
entered by hand, so any of the three can arrive at any time, in any order.

**Row ownership between them is already solved and this spec does not touch it.** The feed
watermark (`src/lib/finances/feedWatermark.ts`) gives each feed a disjoint date range, and
`retireCoveredScrapeRows` hands the tail over inside the same transaction on every sync and
every import.

What is not solved is **balance and pending authority**, which runs on elapsed wall-clock
rather than on when each source's data was actually true:

- `saveBalance` (`src/lib/banksync/mutations.ts:240`) never compares the incoming `asOf`
  against the stored one. Once the 36-hour `shouldKeepProvisionalBalance` hold lapses, a
  stale SimpleFIN balance overwrites a fresher snapshot figure and `balanceAsOf` moves
  **backwards**.
- `hasBrowserPendingAuthority` is a flat 36 hours. A capture 40 hours old loses to a feed
  three days behind, and a sync whose `balance-date` is newer cannot take authority back
  for 36 hours.
- `bankSnapshotApply.ts:546` writes `balanceAsOf = capturedAt` unconditionally, so
  re-pasting an older clipboard regresses the headline — and destroys the feed's own as-of,
  because all three sources share the one column.
- `import.ts:720` stamps `balanceAsOf = new Date()`, the import instant rather than the
  file's newest data day, so a stale CSV claims more currency than it has.

**SimpleFIN does report this.** Each account carries `balance-date` — "when the balance was
true, not when we asked" — and `src/lib/banksync/mapping.ts:114` already reads it into
`bankAccountLinks.balanceAsOf`. Transactions carry `posted` and `transacted_at` epochs too,
though `epochToDateKey` truncates them to day keys. The timestamps largely exist; almost
nothing compares them.

The missing concept is **per-source currency**, and two workarounds stand in for it — the
signal `clean-code.md` names for correcting a model rather than patching it.
`provisionalBalanceAsOf` exists only because a non-feed write cannot be compared against the
feed's own as-of, and `BROWSER_PENDING_AUTHORITY_MS` exists only because nothing records how
current the feed's pending view is.

## Decisions

### D1 — One stamp per source; the headline is derived

Add `finance_account_source_state`, keyed `(userId, accountId, source)` where `source` is
`feed | browser | file`:

| Column                           | Meaning                                                         |
| -------------------------------- | --------------------------------------------------------------- |
| `balanceCents`, `availableCents` | what that source last reported                                  |
| `asOf` (timestamptz, nullable)   | the instant it was true; **null means the source will not say** |
| `asOfDay` (text, nullable)       | `YYYY-MM-DD`, for a file that only knows a day                  |

Keyed on `accountId`, not `linkId`: accounts are the durable identity, links come and go,
and a file import should not need a bank link to record what it saw.

`bankAccountLinks.balanceCents` and `balanceAsOf` remain, redefined as a **derived cache
with exactly one writer** — `recomputeAccountBalanceAuthority(tx, userId, accountId)` picks
the freshest stamp and materializes it, called by all three writers inside their existing
transactions.

**This is what makes the defect unrepresentable rather than guarded.** No writer needs a
"do not regress" check, because a source can only ever write its own row: an old snapshot
updates the browser stamp and the headline simply does not move.

### D2 — The comparison rule is pure, and ties keep the incumbent

`src/lib/finances/sourceAuthority.ts`:

- Both stamps have instants → compare instants.
- Both have only days → compare day keys.
- Mixed → reduce the instant with `toDateKey` and compare day keys, the convention
  `import.ts:223` already uses.
- **Strictly newer wins; a tie keeps the incumbent.** This is what makes the mixed case
  safe without inventing a local end-of-day, and it keeps the direction of error the one
  `2026-08-29-1228` D2 already chose.
- A null stamp never beats a dated one, and wins only when nothing else is dated.

`balanceAsOf()` in `src/lib/banksync/mapping.ts` changes to return `Date | null`, dropping
its `requestedAt` fallback — that fallback is the lie that makes an undated feed response
look current.

### D3 — Pending authority follows the same comparison

`selectWorkingPending` takes browser rows while the browser stamp is fresher than the feed
stamp and feed rows otherwise. A null browser stamp means the feed wins; a null feed stamp
(never synced) means the browser wins. `withheldBrowserPendingAccountIds` re-keys onto the
same comparison and keeps its meaning.

`provisionalBalance.ts` and `browserPendingAuthority.ts` are deleted with their tests.
Keeping either alongside the new table is the duplication this correction removes.

**Recorded limitation:** SimpleFIN dates the _balance_, not the pending set, so the feed's
`balance-date` is a proxy for how current its pending view is. Accepted during shaping.

### D4 — A stale source still contributes rows, and never moves the headline

An import whose as-of predates what is stored is not rejected. Its rows still import —
backfill is legitimate and the watermark already decides ownership — while the headline,
the derived as-of, and pending authority are untouched. The receipt says what was skipped
and why.

### D5 — Backfill from evidence, not from migration time

Following `2026-08-31-1444` D4:

- `feed` stamp ← `balanceAsOf` where `provisionalBalanceAsOf is null`.
- `browser` stamp ← `browserPendingAsOf`.
- Where `provisionalBalanceAsOf` is non-null, the feed's own as-of was already lost. That
  stamp goes to the non-feed row and the feed row is left null-stamped; the next sync
  repairs it. Stated here rather than pretending the data is recoverable.

## Out of scope

- Row ownership and the handover (`2026-08-29-1228` D1–D4).
- Sub-day watermarks. Browser captures carry no per-row time, so an instant-based watermark
  cannot be symmetric between the two feeds.
- The open Chase userscript refusal ("Copied an incomplete snapshot" on a page with no
  pending activity) — a separate in-flight bug, not this delta.
- Any new UI beyond the wording of the existing Dashboard capture prompt.

## Acceptance criteria

- [x] A snapshot at T followed by a sync reporting `balance-date` T−2d leaves the
      snapshot's headline and pending set in force **indefinitely**, not for 36 hours.
- [x] The same snapshot followed by a sync at T+1h hands both over **immediately**, not
      after 36 hours.
- [x] Re-pasting a snapshot captured before the last sync imports rows per the watermark
      and leaves the headline and pending set unchanged.
- [x] A CSV whose newest data day predates the stored stamp imports its rows and does not
      move the headline.
- [x] A sync response with no `balance-date` never overwrites a dated stamp.
- [x] `balanceAsOf` never decreases across a sequence of mixed writes in any order.
- [x] A second user cannot read, change, or delete another user's `finance_account_source_state`
      rows.
- [x] `feedHandoverWrite.integration.test.ts` and `syncPlan.test.ts` pass **unchanged** —
      ownership and handover do not move. `bankSnapshotApply.integration.test.ts` needed
      three edits and none of them is an ownership change: its seed writes a browser stamp
      through `recordSourceState` instead of the dropped column, one audit assertion names
      `balanceSource`/`balanceAsOf` instead of the dropped ones, and a case was added for
      re-pasting an older clipboard. Every ownership, transition and split assertion in it
      is untouched.
- [x] Unit, integration, lint, typecheck and `npm run smoke` all pass.

## Changes from original plan

Material refinements during implementation (requirements, design, scope). Omit pure code
polish.

| #   | Change                                                                                                                                         | Why                                                                                                                                                                                                                                                                                                                                             |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Added `bank_account_links.balance_source`**, naming which source produced the derived headline.                                              | D2 says "a tie keeps the incumbent", but with three source rows and no record of which one holds the headline, "the incumbent" is not a thing the code can name — the winner would fall out of row order. The column makes the tie rule decidable, and makes the audit legible ("headline now from browser").                                   |
| 2   | **A source cannot walk its own row back either.** `recordSourceState` applies the same strictly-newer comparison to the row it is overwriting. | D4 was written about one source outranking another, but the same defect exists within a source: re-pasting an older clipboard rewrote the browser stamp with an older instant, and since it was still the only browser row it kept the headline — at the wrong figure. Found by the acceptance test for re-pasting.                             |
| 3   | **A day-only stamp materializes on the link as UTC noon of that day** rather than as null.                                                     | The derived `balanceAsOf` is a `timestamptz` and a file only knows a day, so a file-sourced headline would have shown no date at all. UTC noon is the encoding `dates.md` requires, and `toDateKey` reads the file's day back on every machine.                                                                                                 |
| 4   | **`importedPostedHeadline` reports a figure older than the feed's instead of refusing**, and carries the day it is true as of.                 | Folding its date comparison into the shared rule (Task 5) means it no longer has an opinion on freshness at all. Two integration tests changed premise as a result: a file that already reported 08/31 now holds the headline against an 08/25 sync from the moment the account is linked, so the "lag" those tests opened can no longer occur. |
| 5   | **`insertedCentsOnOrAfter` deleted**, folded into `importedPostedHeadline`.                                                                    | The delta branch now has to report the newest day it added as well as the total, and computing the two in separate passes over the same rows was the only reason the helper existed.                                                                                                                                                            |
| 6   | **Receipt wording is source-neutral** ("a more current figure is already in force") rather than naming the winning source.                     | With change 2, the source that outranks a stale write is sometimes the _same_ source at a newer stamp, which made the source-naming wording read as nonsense.                                                                                                                                                                                   |

## Tasks

- [x] **Task 1 — Save spec documentation.** This folder: `plan.md`, `shape.md`,
      `standards.md`, `references.md`.
- [x] **Task 2 — The pure rule.** `src/lib/finances/sourceAuthority.ts` and its test, ahead
      of any schema change.
- [x] **Task 3 — Schema and backfill.** `finance_account_source_state` in
      `src/db/schema.ts`, generated migration (`npm run db:generate`), D5's backfill.
- [x] **Task 4 — The shared writer.** `src/lib/finances/sourceStateWrite.ts` (upsert one
      source's stamp, recompute the derived headline) with its integration test.
- [x] **Task 5 — Move the three writers onto it.** `saveBalance`, `bankSnapshotApply`,
      `import`; `balanceAsOf()` returns `Date | null`; `importedPostedBalance.ts` sheds its
      own date comparison into the shared rule.
- [x] **Task 6 — Re-key pending.** `workingPending.ts`, `workingPendingQuery.ts`,
      `banksync/queries.ts` `authoritativeBrowserPending`, `finances/queries.ts`
      `listAccounts`.
- [x] **Task 7 — Delete the superseded modules.** `provisionalBalance.ts`,
      `browserPendingAuthority.ts`, their tests and remaining readers.
- [x] **Task 8 — Out-of-order coverage.** The integration cases in the acceptance criteria,
      including the cross-user case.
- [x] **Task 9 — Verify, freeze, update the roadmap.** Confirm acceptance criteria, complete
      **Changes from original plan**, mark **Status: frozen / complete**, update
      `agent-os/product/roadmap.md`.

## Assumptions

- Exactly three sources write balances: SimpleFIN, browser snapshot, and file import. A
  fourth would be its own spec.
- A file's as-of is the newest data day it contains; files carry no instant.
- The feed's `balance-date` is an acceptable proxy for the currency of its pending set.

## Standing rule

While this spec is **active**, a material change to requirements, design, or scope —
including feedback on what was actually built — is written back into this file with a row in
**Changes from original plan**. Skip pure implementation details. Freeze when verified.
