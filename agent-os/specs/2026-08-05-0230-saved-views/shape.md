# Shaping — Saved Views

**Status: frozen / complete** (2026-08-05)

## Retiring a standing decision, on its own terms

`data-grid.md` carried this in **what we deliberately do not do**:

> **User-saved named views** — Built-in presets plus persisted switches cover it so far.
> Revisit when the presets demonstrably do not.

That line was right when written, and the honest thing was to check its condition rather than
quietly ignore it. Three cycles of the user reshaping views — making the type filters real,
making completion cascade, making a view a collection of settings — are the demonstration it
asked for. And the previous cycle changed what the feature even is: once a view is only a
column order, a set of filters and a grouping, **saving one is copying three values**.

So the row is gone, replaced by a section describing what a saved view captures and why.
Removing a "we don't do this" is a decision in its own right and belongs in the same document.

## The shape that made it small

The key choice was _not_ to invent a second concept:

|                   | Holds                                               |
| ----------------- | --------------------------------------------------- |
| `views:{tab}`     | What a view **is** — name, order, filters, grouping |
| `grid:{tab}.{id}` | How you have since **adjusted** it                  |

That second row is not new. Built-in views already work exactly that way — `grid:tasks.completed`
is where the Completed view remembers your column widths. A saved view slots into the same
machinery, which is why `Reset this grid` on one returns to what you saved without a line of
code being written for it.

## Where the line got drawn

A saved view captures order, filters and grouping and **not** sort or density. It looks
arbitrary and is not: those three are precisely the settings that already distinguish "the
user has not chosen" from "the user chose this". Sort has no such state — every stored blob
carries a concrete `sorts` array, so a view's default could never win against one, and
`sorts: []` legitimately means _unsorted_ rather than _unset_. Capturing sort means giving it
the same nullable treatment `filters` just got, plus a migration, to buy one field.

The naming dialog says so in one line, which is cheaper than a user discovering it.

## Two bugs the type checker could not have caught

- `TasksGrid`'s view objects reference `DEFAULT_ORDER` at module scope, and it was declared
  _below_ them — a temporal-dead-zone crash at import. TypeScript is happy; the module throws.
- `useSavedViews` has to run before `useTabView`, because the allow-list needs the saved ids.
  Wired the other way round, every saved view is silently rejected as illegal and the tab falls
  back to its default view — which looks exactly like "saving did nothing".

Both were found by reading the file and driving the app rather than by the checks passing.

## What "done" looked like

Hide a column, save the view, and watch the picker grow a `Saved` group. Switch to All Tasks
and back and check the column is still hidden. Reload. Then hide a _second_ column, press
Reset this grid, and confirm the second one returns while the first stays hidden — that single
step is what separates a view from a snapshot. Finally delete it and confirm the tab falls
back rather than pointing at nothing.
