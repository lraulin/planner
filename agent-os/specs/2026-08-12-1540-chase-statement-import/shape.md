# Chase card statements + statement snapshots — Shaping Notes

**Status: frozen / complete** (2026-08-12)

## Scope

Import the 31 Chase Prime Visa monthly statement PDFs and persist a statement-level
snapshot (closing balance, due date, credit line, APR, rewards) on its own tables, so
CSV can stay current mid-cycle and the statement is the official monthly record.

Also emit snapshots from the existing Capital One 360 parser (opening/closing already
parsed) so a re-import of those PDFs fills the new tables without touching transactions.

### Out of scope

- Capital One card statement PDFs
- Older Capital One card-1797 CSVs
- Statements UI / reconciliation screen
- Updating an existing transaction when a statement arrives
- Envelopes, transfer matching, hide closed accounts, Plaid
- Deleting the already-imported Chase CSV rows

## Decisions

- Extends the frozen CSV-import and 360-statement specs. Supersedes only the
  "every PDF is a 360 statement" dispatch.
- Same feed `csv:chase-credit` and filename last-four `9910`. Printed PAN last-four
  changed 4903 → 8570 → 9910 and must not create extra accounts.
- Flip statement signs. Normalize merchant text. Never append order-number wraps.
- Cross-source skip on date + signed amount + description (posted date ignored).
  Fingerprint unique index still covers same-file re-import.
- Two tables: `finance_statements` + `finance_statement_rates`.
- Opening/closing and activity totals in module sign; due/limit/YTD as printed
  magnitudes; rewards as integer points.
- 360 snapshots: opening/closing only.
- Insert-or-skip statements. No UI this spec.
- Pure text parser + anonymized fixtures. Dropbox PDFs stay out of the repo.

## Context

- **Visuals:** none copied. Format reference is the local Dropbox statements; they stay
  out of the repo (name, address, full PAN).
- **References:** see `references.md`.
- **Product alignment:** historical backfill plus a snapshot store under roadmap
  § Financial planning so later envelopes/reconciliation have official monthly
  bookends. Envelopes remain the outstanding MVP piece.

## Standards Applied

- development/testing — pure parser tests; integration two-user case
- development/clean-code — logic in `src/lib/finances/**`; route stays thin
- development/dates — calendar-day strings, no `Date` local midnight
- development/security — `userId` scoping; do not log extracted statement text
- database/migrations — generate, never hand-write without snapshot
- api/response-format — existing `{ ok, created, skipped, warnings }` envelope plus
  snapshot counts
