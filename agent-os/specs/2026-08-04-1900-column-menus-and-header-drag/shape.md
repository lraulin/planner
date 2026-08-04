# Shaping — Column Menus and Header Drag-to-Reorder

**Status: frozen / complete** (2026-08-04)

## The ask

> "Let's add column menus so we don't have to think about where to find the controls. And
> add the ability to re-arrange columns by drag and drop."
>
> References: AG Grid `component-menu-item`, MUI X `column-menu`.

## The problem, stated precisely

The grid's controls were complete but organised by mechanism. The user's mental model when
they reach for a header is **"do something to this column"**; the interface answered
"depends which something". Three of the five column operations lived outside the header
entirely, and one of the two that lived inside it (width reset) was an invisible gesture.

## Options considered

| Option                                                         | Verdict                                                                                                                                                                                                      |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Funnel **and** a separate `⋮` menu button (AG Grid's default)  | Rejected. Priority is a 3rem column and Icon is 3rem; a label plus two 12px buttons plus the resize handle leaves the label truncated to nothing.                                                            |
| One `⋮` menu, filter demoted to a menu item that opens a panel | Rejected. Filtering is the most-used control on this header; making it two clicks to pay for hide/move being two clicks is a straight trade, not an improvement.                                             |
| **One `▾`, tabbed Filter / Menu popover**                      | **Chosen.** One button fits anywhere. Filter stays one click (default tab). Everything else moves from "somewhere else" to "one tab away". It is also what AG Grid's tabbed menu and MUI's menu do.          |
| Hover-revealed menu button                                     | Rejected. The entry point to the whole control surface is the last thing to hide; the existing hover-revealed `only` button is a secondary action inside an already-open popover, which is a different case. |

## Constraints that shaped it

- **`ux-principles.md`: keyboard first on desktop, and no gesture may be the only path.**
  This is what forces Move left / Move right to exist in the menu even though drag now
  works, and what makes the header's click/Shift-click/drag/double-click gestures
  _shortcuts_ rather than the interface.
- **`data-grid.md`: do not overload drag for grid configuration.** Reconciled rather than
  ignored — see `plan.md`. The prohibition was aimed at a drop-zone Group By panel, which
  stays out.
- **`data-grid.md`: one hook owns the whole `grid:{tabId}` scope.** Every layout command in
  the menu therefore travels through `useGridState`'s single `patch`; the menu holds no
  state but which tab is showing.
- **Testing standard: real logic in `src/lib/**` with a test beside it, no component
  tests.** Availability rules and the drag slot arithmetic are pure and tested; the popover
  is verified by driving the real app.

## What "done" looked like

Driving the real grid: open a menu on a filterable and an unfilterable column, sort from the
menu, hide a column, move one, reset the layout, drag a header across three columns and read
the order back, reload and confirm it persisted, then drag an Outline **row** to prove the
two gestures do not collide.
