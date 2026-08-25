# Edit a bill's next charge date — Shaping Notes

**Status: frozen / complete** (2026-08-25)

## Scope

Restore a way to change a declared bill's next charge date. The Budget bills table already
has the column; after the Commitments merge it is display-only. Create-time dialogs still
write `anchorDate`. The mutation already accepts the field.

### Out of scope

- Cadence dropdown rewriting next charge on an existing bill
- Overdue colour on this column
- A new agent tool
- Unscheduled bills (propane) gaining a date
- Schema or `billAnchor` semantics, other than refusing a write `billAnchor` would ignore

## Decisions

- Inline `DateKeyCell` on the existing Next charge column (D1)
- Write is `anchorDate`; clear writes `null` and walks from last charge (D2)
- Unscheduled stays a label, not a picker (D3)
- Dates on or before the last posted charge (via payee claim) are refused in lib (D4)
- Next-due display is not gated on apply snapshots (D5)
- Work in a git worktree because another session owns the main checkout

## Context

- **Visuals:** None
- **References:** `one-budget` (column exists, editor dropped); `commitments-curation` D7
  (`anchorDate` later than last charge is the next charge); `DateKeyCell`; `upsertBillEnvelope`
- **Product alignment:** Gap on the Budget bills table, not a named roadmap item. Aligns
  with one-budget's "one table for bills, inline facet edits"

## Standards Applied

- components/ux-principles — grid-visible fields edit in place; dates commit on blur
- components/data-grid — reuse `DateKeyCell`
- development/testing — pure function + integration with cross-user
- development/dates — `YYYY-MM-DD` calendar keys, native date input
- development/clean-code — validation in lib, not the cell
- development/security — `userId` already on the mutation
