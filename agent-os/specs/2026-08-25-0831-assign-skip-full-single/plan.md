# Skip assign confirmation when one category is fully funded

**Status: frozen / complete** (2026-08-25)
Spec folder: `agent-os/specs/2026-08-25-0831-assign-skip-full-single/`

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-24-1311-budget-assign-options/` — eight options, clamp
  to Ready to Assign, preview as the engine, selection scope.
- **Supersedes:** `agent-os/specs/2026-08-24-1311-budget-assign-options/` **D6** only the
  "always a preview" rule, and only for the single fully-funded envelope case below. A
  shortfall, a split across envelopes, a return-money option, and an empty write still
  preview.

## Context

Assign options always opened Auto-Assign Preview, even when the user had already picked
one envelope (right-click Assign, or a one-row selection) and Ready to Assign covered the
ask. That confirm then said "1 category will be fully funded" and asked for Assign Money —
the Auto list had already shown the amount. It slowed the daily "fund this one" gesture.

The preview still earns its keep when money is short or several envelopes share the pot:
those are the cases the user cannot see from the option row alone.

## Decisions

**D1 — One fully funded envelope writes immediately.** If the planned result has exactly
one line, that line's status is `full`, there is something to write, and there is no
shortfall, skip the preview and commit. Applies to banner Assign (one-row or one-eligible
scope), the row-menu Assign submenu, and Tools ▸ Assign.

**D2 — Everything else still previews.** Partial, skipped, reduced, more than one line,
or nothing to write. Returning money (Reduce Overfunding / Reset) is never "fully funded."

The engine does not change. `needsAssignPreview` is a read of the planned result; the
mutation is the same write the preview's Assign Money would have issued.

## Acceptance criteria

- [x] Right-click one underfunded envelope → Assign ▸ Underfunded, with enough Ready to
      Assign, writes without opening the preview.
- [x] The same envelope with too little Ready to Assign still opens the preview (partial).
- [x] Underfunded across two or more envelopes still opens the preview even when both
      fully fund.
- [x] Reduce Overfunding / Reset on one envelope still opens the preview.
- [x] `needsAssignPreview` lives in `src/lib/finances/budget/assign/plan.ts` with named
      tests for those cases.

## Changes from original plan

None — shaped from use, implemented as written.
