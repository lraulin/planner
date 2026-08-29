# Complete bank snapshots and finance audit — shaping notes

**Status: frozen / complete (2026-08-29)**

## Scope

Replace the two pending-only browser captures with complete current-cycle credit-card
snapshots, reconcile those snapshots without losing user-owned transaction state, and make
all money-changing finance workflows explain themselves through one immutable audit ledger.

## Root cause

The current contract captures a posted-only headline balance but only the pending rows that
complete that balance. On the next paste, vanished pending rows are deleted without importing
their posted replacements. That independently mutates Budget activity even when the bank's
working balance is unchanged. It is a model error shared by both browser sources, not a
missing fallback at one delete site.

## Design pressure

- A complete snapshot must be self-describing and fail closed because a filtered bank table
  is silently incomplete data.
- Posted reconciliation must be one-to-one because equal same-day card purchases are common.
- Pending rows contain user-owned edits before posting; replacing them wholesale destroys
  information, but carrying a changed split across a different total can also corrupt money.
- Browser and SimpleFIN pending need a time-bounded authority rule shared by every money
  reader, not view-specific filtering.
- Audit evidence has to share the mutation transaction or it can assert a financial change
  which never committed (or omit one which did).
- The audit is explanatory evidence. The transaction/allocation/account tables remain the
  only operational financial model.

## Out of scope

- Public HTTP or MCP audit endpoints
- Editing/deleting audit evidence or audit-driven undo
- Checking-account browser capture
- Bank-page network calls to Planner
- Bank screenshots or duplicate storage of uploaded PDF/CSV bytes
- Rebuilding the finance ledger from audit events

## Context

- No new bank scraping is needed during implementation; the existing local reference and
  inspected-page fixtures are the source of truth.
- The exact Chase regression is intentionally arithmetic-invariant: the posted/pending mix
  changes by $191.92 while working balance and all budget checkpoints do not.
- Existing frozen specs remain unchanged. This delta is the durable correction.
