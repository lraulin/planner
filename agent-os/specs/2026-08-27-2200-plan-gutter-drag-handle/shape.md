# Plan-module grab bar and live drag ids — Shaping Notes

**Status: frozen / complete** (2026-08-27)

## The report

> It looks like when we added the selection checkbox, we broke the outline/planner's drag
> and drop to prioritize and nest. How about we just revert that for the Plan/Task Chooser
> modules, and keep it for Finances… and I guess pretty much everything outside of the plan
> module.

Opened with "A foolish consistency is the hobgoblin of little minds" — an explicit rejection
of the frozen spec's "checkboxes on every DataGrid, for consistency."

## Scope

Give the gutter two modes. Grids that drag — and, by the developer's call, every grid in the
Plan module whether it drags today or not — get the pre-checkbox grab bar back. The
catalogs keep the checkbox and its header select-all.

Then fix the reason drag was actually dead, which turned out not to be the checkbox at all:
the memoised row kept a drag binding whose captured `dragIds` was still `null`, so every
`dragover` was refused. See `plan.md` **Root cause 1**.

Give Goals and Result Areas the drag the developer pointed out they should already have:

> Goals can be nested just like projects and tasks and should have the same dragging
> behavior… and nothing in Plan has major important use cases for selecting all… Might as
> well have consistent UI throughout the module.

That last clause is why the rule is "the Plan module", not "grids with `rowDrag`" — the two
sets differ at Goals, Result Areas, Wish List (in Plan, no drag) and Notes, Day (drag, not in
Plan). Notes and Day get the grab bar as well, because leaving a known-broken drag in place
to honour a module boundary would be the same foolish consistency.

## Decisions worth keeping

- **Explicit prop, not derived from `rowDrag`.** Chooser and Day drop `rowDrag` under an
  active sort. Deriving the chrome from it would swap the gutter's appearance when you click
  a column header.
- **The handle stays empty.** A grip glyph is another target competing for a 28px track, and
  the row already carries a second handle on its type icon.
- **One width for both modes** (1.75rem). `nameColumnLeft` computes the drop-line offset
  from it and the header shares the template; a mode-dependent width would make both care.
- **`leadingGutter={false}`** in handle mode. `ColumnHeader` already renders the empty track
  for `false` — that was the pre-checkbox behaviour, so nothing there had to change.
- **Refs, not a memo change.** Making `dragBindingEqual` compare `dragIds` would re-render
  every visible row on `dragstart` and again on `dragend` — undoing `90d91ec` for the
  Register's 7,000 rows. Reading the live ids from a ref keeps the memo doing its job. This
  is the same trick `90d91ec` used for `selectedIds` in the row menu.
- **Written synchronously beside the state.** `selectedIdsRef` is updated in a passive
  effect, which is fine for selection; `dragIdsRef` is not, because `dragover` can arrive
  before an effect runs.

## Achieve

Achieve's outline gutter had neither checkboxes nor row numbers. `2b55133` recorded its
checkbox as a deliberate divergence; the Plan module goes back to Achieve's chrome. The
catalogs (Finances, Contacts, Payees, …) are beyond Achieve and keep theirs.

## Out of scope

- Multi-select drag — deferred since `2026-07-27-1100`, still deferred.
- The host gates on Chooser (`rankByTcPriority`, unsorted), Day (unsorted) and Notes
  (nested + manual) — intentional, unchanged.
- Wish List drag: it renders grouped `WishListRow`s, not a tree.
- Any wider revisit of the `DataRow` memo or virtualization.
