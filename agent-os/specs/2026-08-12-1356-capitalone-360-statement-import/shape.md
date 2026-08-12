# Capital One 360 statement PDF import — Shaping Notes

**Status: frozen / complete** (2026-08-12)

## Scope

Import the 37 Capital One 360 combined monthly statement PDFs (`Statement_YYYY-MM.pdf`)
into the existing Finances register. Fill Jul 2023–Aug 2024 (and any statement-only days)
that the bank CSV exports do not cover. Land checking and savings on the accounts the CSV
importer already created; create the matured CD as a closed investment account.

### Out of scope

- Chase or Capital One **card** statement PDFs (different layout)
- Older Capital One card CSVs (`CapitalOne/2021.csv`, card 1797)
- Envelopes, transfer matching, categorization rules
- Hiding closed accounts in the register
- Register UI changes
- Plaid / any API feed
- Schema / migration

## Decisions

- Extends the frozen CSV-import spec; does not supersede it.
- Same feed string `csv:capitalone-bank` and last-four keys, so the unique index dedups
  overlap and no second checking/savings account appears.
- CD `…2957` → kind `investment`; `closedAt` set on close-out if still null.
- Statement Credit/Debit is sign, not `sourceCategory`.
- Pure text parser + thin `unpdf` extract. Fixtures are anonymized excerpts, never the
  real PDFs (PII).
- Same import panel/route; accept `.pdf`; `MAX_FILES` 60.

## Context

- **Visuals:** none copied. Format reference is the local Dropbox statements; they stay
  out of the repo (address, full account numbers).
- **References:** see `references.md`.
- **Product alignment:** historical backfill under roadmap § Financial planning so later
  envelopes/patterns have the full 360 history. Envelopes remain the outstanding MVP
  piece.

## Standards Applied

- development/testing — pure parser tests; integration two-user case
- development/clean-code — logic in `src/lib/finances/**`; route stays thin
- development/dates — calendar-day strings, no `Date` local midnight
- development/security — `userId` scoping; do not log extracted statement text
- api/response-format — existing `{ ok, created, skipped, warnings }` envelope
