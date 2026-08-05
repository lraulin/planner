# Shaping — Completion Cascade, and Levels You Can Dissolve

**Status: frozen / complete** (2026-08-04)

## The reframe

The message that started this contained a correction worth isolating:

> "In AP's Outline, if I filter by Icon and set custom filter `<> Result Area`… all result
> areas are still visible unless they had no visible children. But there's an Areas checkbox;
> if it's off, it's like Result Areas just don't exist. Everything under a result area is
> top-level now. **Maybe our UI wasn't wrong, just backwards.**"

The previous cycle deleted the type checkboxes as "column filters wearing checkboxes". That
was half right. They _were_ wrong as filters — but the thing they should have been doing was
never available anywhere: **dissolving a level**. Filtering asks which rows to look at, and
a filtered tree keeps its parents. Flattening asks the tree to stop being organised that way,
and promotes what is underneath. Achieve ships both, side by side, and they do not overlap.

So the checkboxes come back, with the semantics they always should have had, and type
_filtering_ stays on the `type` column with everything else.

## Two questions answered directly

**"Confirm modal on cascading completion?"** — Keep one, but only where it earns its
interruption. The cascade is deliberately asymmetric: completing a project completes fourteen
tasks, and setting the project back to In progress will not un-complete them. That is the
"hard to reverse" case `ux-principles.md` reserves confirmation for. But it is only hard to
reverse when there is open work underneath, and there usually is not — you complete a leaf, or
a project whose tasks are already ticked. Silent in those cases, and a count when it matters.

**"Inconsistency or an extra click?"** — Inconsistency, when the two controls are the same
concept. And `data-grid.md` had already ruled on this one: _"A tab's default arrangement is
its default `groupBy`, never a separate toggle."_ The Projects tab had already given up its
`Groups` switch for that rule; the Outline's `By category` was the last holdout. Folding it in
cost one click and brought `Collapse all` with it, which the toggle never had.

The general form: an extra click is a cost you can measure and forget. Inconsistency is a cost
paid every time someone looks for the control and reasons from the wrong model.

## Why the cascade lets `Show completed` die

These arrived in the same message and are the same decision. `Show completed` had to drop a
node's _whole subtree_, because a completed project could contain open tasks and showing them
under a hidden parent was the orphan problem. Once completing a project settles the work
beneath it, that cannot happen: a finished branch is settled all the way down, and an ordinary
State filter removes it. The special case was compensating for a model that was missing a rule.

## Constraints that shaped it

- **`ux-principles.md`: "Error prevention > error recovery — make dangerous or irreversible
  actions hard to do by accident."** The whole basis for the conditional confirm, and for
  confining it to the irreversible direction.
- **`data-grid.md`: arrangements are `groupBy`; per-tab toggles live in the `switches` map.**
  Between them these deleted a bespoke checkbox and an entire settings scope.
- **`testing.md`: anything touching the database gets an integration test, and it is not done
  until a second user has failed to read, change and delete the first user's row.** The
  cascade walks the tree by parent id, which is exactly where an unscoped query would leak.

## What "done" looked like

Complete a project with five open tasks and read the prompt. Confirm it, reload, and read the
states back from the database. Re-open one task and watch its ancestors go In progress while
its finished siblings stay completed. Complete a repeating task and check its subtree is Not
Started, not settled. Turn Areas off and read the row labels — projects at top level. Group by
Category. Untick Completed in the State filter and count the rows.
