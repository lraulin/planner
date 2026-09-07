# Move money to Ready to Assign — Shaping Notes

**Status: frozen / complete** (2026-09-07)

## Scope

Let **Move money to…** send Available back to **Ready to Assign**, YNAB-style, as the first
destination in the shared typeahead. The write is the existing unassign operation.

### Out of scope

- Showing Ready to Assign on transaction Category (Register, drawer, splits, Set category)
- Assign To, Payees, Supplies
- Fix This (already unassigns to Ready to Assign when the headline is negative)
- Cover overspending sources (Ready to Assign is already first there)
- Schema, a new envelope kind, or teaching `transferBetweenCategories` a null destination
- Toasts / undo

## Decisions

- Ready to Assign is a move _destination_, not a category. Opt-in on the shared picker;
  default off so filing surfaces cannot grow it by accident.
- First in the open list; default selected when Move money opens.
- Sentinel `__ready_to_assign__`, never a UUID. Dispatch `unassign`, not `transfer`.
- Reuse `unassignToReadyToAssign` — one write, one movement note, same clamp as Fix This.
- Amount suffix is display-only (current Ready to Assign, signed).

Lee asked for this explicitly and forbade questions; the remaining choices (sentinel vs
null-to transfer, default selected vs listed-only) follow Cover overspending’s “Ready to
Assign first” and Fix This’s existing write rather than a new model.

## Context

- **Visuals:** None. YNAB Move money destination list is the product reference; Cover
  overspending’s Ready to Assign-first source list is the in-app one.
- **References:** See `references.md`.
- **Product alignment:** Finance is beyond Achieve (Phase 3). Envelope budget follows
  Actual’s arithmetic and YNAB’s everyday verbs. This is a YNAB destination, not an
  Achieve control. Ready to Assign stays a derivation, not a row you can file a charge to.

## Standards Applied

See `standards.md`.
