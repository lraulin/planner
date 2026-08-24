# Actual Categories and Tags — Shaping Notes

**Status: frozen / complete** (2026-08-23)

## Problem

Planner currently has two incompatible meanings of Category: a fixed classifier taxonomy for
transactions/reports and a user-owned envelope hierarchy for zero-based budgeting. Rules write
the former, then `sourceCategories` tries to translate it into the latter. This prevents the
Actual workflow where rule Category actions directly choose the budget category.

## Intended workflow

- Budget exposes an exact uncategorized count and links to those Register rows.
- Register's Category column edits the budget category directly.
- Repeated manual choices teach an exact-payee rule with Actual's 3-of-5 heuristic.
- Cross-cutting traditional labels live as `#tags` in Notes and can coexist with categories.
- Tags can filter balanced reports but cannot create overlapping total buckets.

## Current-data audit at shaping time

The local database held 7,030 transactions, 4,798 effective legacy classifications, 31
existing envelope assignments, and no existing tag tokens. These are a baseline only; the
cutover's fresh fingerprinted preview is authoritative.

## Migration stance

This is a model correction, not a compatibility shim. The shipped rollout is additive →
preview/apply per user → receipt reconciliation. Existing envelope choices always survive,
and unresolvable mappings become tag-only rules that remain visible for review. Destructive
cleanup requires its own delta after every deployed environment is backed up and reconciled.

## Visual direction

Use the supplied Actual Tags management screenshot for the dense list, colored pills,
descriptions, and View Transactions affordance. Translate it into Planner's shared DataGrid,
desktop inline editing, and phone full-screen drawer conventions.

## Decisions captured during shaping

- Migrate the old transaction axis to tags rather than retain three classification concepts.
- Use envelope totals plus tag filters in reports.
- Apply all matching rules in visible order, later actions winning.
- Convert legacy classifier rules to Category + Add tag actions.
- Use one Actual-style stored category value.
- Build the full coherent tag workflow.
- Keep unmapped rules tag-only and flag them instead of aborting or creating envelopes.

## Status

Closed as shipped on 2026-08-23. The additive compatibility storage is an explicit as-built
boundary; its eventual removal is new work rather than an amendment to this record.
