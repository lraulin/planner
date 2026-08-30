# Fix This (negative Ready to Assign) — Shaping Notes

**Status: active**

## Scope

When Ready to Assign is negative on a current or future Budget month, the summary Assign
control becomes **Fix This** and opens a dialog to un-assign money from any envelope that
still has Available — including switching to a later month that has assignments — until the
viewed month’s Ready to Assign is back at $0 (or positive, if MAX overshoots).

This is YNAB’s Fix This job, in this app’s Budget language.

### Out of scope

- Toasts and undo (no app-wide toast; if one lands later it covers this too)
- Session log of “categories I touched this sitting”
- A named “Move leftover money from last month” chip
- Treating leftover Hold (`bufferedCents`) as a picker row (Release stays)
- Redesigning Assign’s Auto tab
- Envelope-to-envelope Move Money
- Schema / migrations

## Decisions

See `plan.md` D1–D6. The ones that took the most argument:

- **It is not Move Money.** The first screenshots were Groceries → Tithing leftover. Lee
  clarified: this is for when Ready to Assign is negative, to fix it. The UI he described
  is YNAB’s Un-assign money from list (month chevron, any category with Available, future
  months too). Envelope-to-envelope stays as it is.
- **Preview then confirm, not one-click auto-drain.** Assign already previews. The dialog
  is the audit. No new undo stack.
- **One summary button.** Assign becomes Fix This when the number is negative. Not two
  buttons, not Tools-only.
- **Put the verb on the number.** Lee almost did not notice Assign: it is `ml-auto` on the
  opposite edge of the card, behind the muted “assigned more than you have.” Drop
  `ml-auto`; number and button share a baseline; the note goes under the figure.
- **The hole is the viewed month; the source month is the picker.** Future-month unassign
  is how month-ahead’s assigned-in-future hole closes, without changing `?month=`.

## Context

- **Visuals:** `visuals/ynab-move-money.png` and `visuals/ynab-leftover-moved.png` (YNAB
  Move Money, not the shipped UI; gitignored). `visuals/approved-wireframe.md` is the
  layout we are building.
  Lee also described YNAB’s Fix This panel in prose: red `$9,765.23` / “You assigned more
  than you have” / Fix This / Un-assign money from / Aug 2026 / Bills with Available.
- **References:** `MoveMoneyDialog`, `AssignDialog`, `BudgetSummary`, `operations.ts`
  (`transferBetweenCategories`, `setAssignment`, `assignFromReadyToAssign`), fold
  `applyAssignedInFuture`.
- **Product alignment:** Month-ahead already named the fix (“move money back — same as
  YNAB, no extra machinery”). This spec is that UI. Envelope math stays Actual; the
  gesture is YNAB. No new services.

## Standards Applied

- `components/ux-principles.md` — modal for a blocking correction; verb on the number
- `components/modal-pattern.md` — ModalShell, unmount on close
- `components/responsive.md` — bottom sheet below `md`, `min-h-tap`
- `components/navigation.md` — `budget.fix-this` is a command; unavailable is disabled
  with the reason
- `development/testing.md`, `security.md`, `clean-code.md`, `dates.md`, `commits.md`
