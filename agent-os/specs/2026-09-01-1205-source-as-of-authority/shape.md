# Source currency — Shaping Notes

**Status: frozen / complete**

## Scope

Make balance and pending authority a function of **when each source's data was true**,
rather than of how much wall-clock time has passed since it was written. Any of the three
ingestion paths — SimpleFIN sync, browser bank snapshot, CSV/statement import — may run at
any time, in any order, and the account must end up showing the freshest figure each time.

The shape of the change: one as-of stamp per source, stored separately, with the account's
headline derived from whichever stamp is freshest.

### Out of scope

- Row ownership and the browser-tail handover (`2026-08-29-1228` D1–D4). That model works
  and is deliberately untouched.
- Sub-day watermarks. SimpleFIN transactions carry `posted` / `transacted_at` epochs, but a
  browser capture has no per-row time at all, so a time-based watermark cannot be symmetric
  between the two feeds. Day granularity stays.
- The open Chase userscript refusal — separate in-flight bug.
- New UI.

## Decisions

Three shaping questions, all answered by Lee:

1. **Precedence** — newest as-of wins. The 36-hour windows survive only as a fallback for a
   source that reports no as-of at all. (Chosen over keeping the windows primary, and over
   removing them with no fallback.)
2. **Pending** — the same comparison governs which pending set counts, replacing the flat
   36-hour browser window. Accepted with the caveat that SimpleFIN dates the balance rather
   than the pending set, so `balance-date` is a proxy for the currency of its pending view.
3. **Stale input** — a source older than what is stored still contributes its rows, but
   never moves the headline, the derived as-of, or pending authority. (Chosen over rejecting
   the import outright, which would block legitimate backfill from an old export.)

Design decisions taken during shaping:

- **Per-source rows, not more nullable columns on the link.** The missing concept is
  per-source currency; two workarounds already stand in for it (`provisionalBalanceAsOf`,
  `BROWSER_PENDING_AUTHORITY_MS`), which is the `clean-code.md` signal to fix the model.
- **Keyed on `accountId`, not `linkId`.** Accounts are the durable identity, and a file
  import should not need a bank link to record what it saw.
- **The headline stays on the link, as a derived cache with one writer.** Avoids touching
  every reader while keeping a single recompute path inside the writers' own transactions.
- **Ties keep the incumbent.** This is what lets an instant and a calendar day be compared
  without inventing a local end-of-day — the timezone hazard `dates.md` exists to prevent.
- **A null `asOf` means "this source will not say", not "now".** `balanceAsOf()` drops its
  `requestedAt` fallback; treating an undated response as current is exactly the
  stale-overwrite bug.

## Context

- **Visuals:** None.
- **References:** See `references.md`.
- **Product alignment:** Continues the live-bank-sync line in `roadmap.md` Phase 2 (the
  ✅ entries for complete card snapshots and feed ownership by watermark, around L851–L871).
  No roadmap item is opened by this delta; it hardens shipped ones.

## Evidence gathered during shaping

- `banksync/mapping.ts:114` already reads SimpleFIN's `balance-date`; `mapping.ts:118`
  falls back to the request instant when it is absent.
- `banksync/mutations.ts:240` writes the incoming balance with no comparison against the
  stored `balanceAsOf`.
- `bankSnapshotApply.ts:546` and `import.ts:720` both write `balanceAsOf` unconditionally,
  the latter with the import instant rather than the file's own newest data day.
- `feedHandoverWrite.ts:52` retires covered `scrape:*` rows — including pending holds whose
  day the feed has posted — on both sync and import. Row-level handover is not the problem.

## Standards Applied

- `development/clean-code.md` — the model correction, and where the rule lives.
- `development/dates.md` — instant vs calendar day is the crux of the comparison.
- `development/testing.md` — pure test beside the rule; integration per writer; cross-user.
- `database/migrations.md` — generated migration with its snapshot.
- `development/security.md` — `userId` on every mutation and every read of the new table.
- `development/commits.md` — one logical change per commit across a multi-table change.
