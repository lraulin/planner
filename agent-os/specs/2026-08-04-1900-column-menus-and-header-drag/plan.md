# Column Menus and Header Drag-to-Reorder

**Status: frozen / complete** (2026-08-04)  
Spec folder: `agent-os/specs/2026-08-04-1900-column-menus-and-header-drag/`

Delta-spec over the frozen [`2026-08-04-0924-grid-control-surface`](../2026-08-04-0924-grid-control-surface/)
and [`2026-08-04-1745-filter-control-per-kind`](../2026-08-04-1745-filter-control-per-kind/).

## Context

The grid had accumulated a full set of column controls, but they were grouped by
**mechanism** rather than by **target**:

| To do this…       | You had to…                                                |
| ----------------- | ---------------------------------------------------------- |
| Sort by a column  | Click its header label (Shift-click for a secondary key)   |
| Filter a column   | Click the `▾` funnel in its header                         |
| Hide a column     | Toolbar → Show Fields → find it in a two-list dialog       |
| Reorder columns   | Same dialog, then Move Up / Move Down or an in-dialog drag |
| Undo a width drag | Double-click a 4px handle you cannot see                   |

Knowing what you wanted to do told you nothing about where to do it. The ask was a column
menu per header — "so we don't have to think about where to find the controls" — plus
drag-and-drop column reordering, with
[AG Grid's column menu](https://www.ag-grid.com/javascript-data-grid/component-menu-item/)
and [MUI X's](https://mui.com/x/react-data-grid/column-menu/) as the references.

## Decisions

| Decision           | Choice                                                                                                                                                                                                |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One button, tabbed | A single `▾` per header opening a **Filter / Menu** tabbed popover, not a funnel plus a separate menu icon. Two icons do not fit beside a label in a 48px header cell (Priority, Icon, `%`).          |
| Default tab        | **Filter** on any filterable column, **Menu** otherwise. The button then costs exactly what the funnel cost on the hottest path; nothing about filtering got slower.                                  |
| Right-click        | Right-clicking anywhere on a header cell opens that column's menu, matching the row context menu one row down and the Windows list headers this app reimplements.                                     |
| Disabled, not gone | Unavailable items stay visible and carry a `title` saying why. Same posture the funnel already takes with `(Select all)`.                                                                             |
| Sort in the menu   | Explicit `Sort ascending` / `Sort descending` / `Clear sort`. Needed a new `setSort(columnId, direction \| null)`; the existing `toggleSort` cycle cannot express "make this descending" in one step. |
| Sort replaces      | A menu pick replaces the whole sort, as a plain header click does. Accumulating keys stays Shift-click's job, so a pick can never leave a stale secondary key the user cannot see they chose.         |
| Grid-wide repeats  | `Show fields…` and `Reset columns` are in every column menu **and** on the toolbar. The repetition is the point — a menu that sends you back to the toolbar is a partial answer.                      |
| Header drag        | Dragging the header **label** reorders columns; the drop marker is an insertion line on the boundary. Reconciled against the standing "do not overload drag for configuration" rule — see below.      |
| Prop shape         | One `columnControls` bundle (`ColumnControls`) rather than six new props at eight `DataGrid` call sites. `useGridState` returns it ready-made and memoized.                                           |
| Pure rules         | Item availability and the drag slot live in `src/lib/grid/columnMenu.ts` with tests. The component asks and renders.                                                                                  |

### Reconciling header drag with `data-grid.md`

The standard said: _"Do not overload the drag gesture for grid configuration."_ That rule
was written against AG Grid's **drag-a-header-into-a-Group-By-zone** panel, where one gesture
means two different things depending on where you release. Header-to-header reordering is
narrower and survives the rule's intent:

- It starts on the header label, not on a row, so it cannot be confused with a row drag.
- The header row `preventDefault`s a dragover **only while a header drag is in flight**, so a
  row dragged over the header gets the browser's no-drop cursor instead of looking like a
  column move. Verified in the browser on the Outline, which has both.
- Its outcome is also reachable from the menu (Move left / Move right), so drag is never the
  only path — the rule the standard actually protects.

The Group-By-zone prohibition stands, and the standard now says so explicitly.

## In scope (as built)

- `src/components/grid/ColumnMenu.tsx` — the tabbed popover. The filter panel moved here
  from `ColumnHeader.tsx` unchanged in behaviour.
- Menu items: Sort ascending / descending / Clear sort · Filter… · Move left / Move right /
  Hide column / Reset width · Show fields… / Reset columns.
- `src/components/grid/ColumnHeader.tsx` — header drag-to-reorder with an insertion marker,
  right-click to open the menu, single-open-menu-at-a-time, and one `ShowFieldsDialog`
  instance for the whole header row.
- `src/lib/grid/columnMenu.ts` + tests — `columnMenuState`, `headerDropIndex`,
  `reorderByHeaderDrag`.
- `useGridState`: new `setSort` and `columnControls`; `DataGrid`: new `onSetSort` and
  `columnControls` props, wired at all eight call sites.
- `MenuItem.title` on the shared menu type, so the row context menu can explain a disabled
  item too.
- `dayColumns`: `fieldLabel: "Done"` on the tick-box column, which had a blank header and so
  named itself nowhere.
- `data-grid.md`: new **column menu** section; drag section amended.

## Out of scope (as built)

- **"Group by this column"** in the menu. It would need `groupDimensions`, `groupBy` and
  `setGroupBy` pushed into `DataGrid`, and Group by is the one control that was never hard to
  find — it is a labelled toolbar select showing its own state.
- **"Add as secondary sort."** Shift-click is taught by the header tooltip and by the sort
  items' `title`; a fourth sort entry pushed the menu past a screenful for a feature with an
  existing affordance.
- **Pinning / freezing columns, autosize-to-fit.** No stored model for either, and neither
  was asked for.
- **Keyboard arrow-navigation inside the popover.** Its items are native buttons in DOM
  order, so Tab reaches them and Escape closes; a roving-tabindex implementation is the
  `ContextMenu` pattern and can be lifted later if it is missed.
- Any change to what the filters themselves do.

## Changes from original plan

| Change                                                            | Why                                                                                                                                                                                                                                                                                                     |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Popover cap raised from `max-h-80` to `max-h-[26rem]`             | With the tab strip and the Filter… entry, the menu was ~340px against a 320px cap, so `Show fields…` and `Reset columns` sat below the fold. They looked present (visible in the DOM, clipped on screen) and clicked through to the grid behind. Found by driving it in the browser, not by reading it. |
| Kept the funnel's `▾` glyph rather than a new menu icon           | The button is in the same place, does the same thing on click for filterable columns, and now does more. A new glyph would have advertised a change to the one path that did not change.                                                                                                                |
| Header label button is no longer `disabled` on unsortable columns | A disabled button cannot be an HTML5 drag source, so an unsortable column could not be reordered. It is enabled with no click handler instead.                                                                                                                                                          |
| Menu strings use `fieldNameOf(column)`, not `column.label`        | The Day tab's tick-box column has an empty header; `" column menu"` names nothing. Gave that column a `fieldLabel` too, which also fixes its blank row in Show Fields.                                                                                                                                  |

## Acceptance criteria

- [x] Every column on every grid has a `▾` menu, including ones that were never filterable.
- [x] Filterable columns open on the Filter tab; the set filter, bands, `only`, `none` and
      Custom criteria behave exactly as before.
- [x] Sort ascending / descending / Clear sort change the sort and update the header
      indicator; the direction a column already has is disabled.
- [x] Move left / Move right / Hide column / Reset columns change the layout and **persist
      across a reload** (verified on Tasks).
- [x] Move left is disabled on the first column, Move right on the last, Hide on a
      `hideable: false` column and on the last remaining one.
- [x] Dragging a header onto another reorders columns, with an insertion line at the
      boundary that will receive the drop.
- [x] Row drag still works on the Outline, and the two gestures do not interfere.
- [x] No column header below `md`, so the compact layout is untouched.
- [x] `npm run test:unit` (1154), `npm run typecheck`, `npm run lint` clean.

## Follow-ups (new work — not amendments to this frozen spec)

- Group by this column, if the toolbar picker ever stops being enough.
- Roving-tabindex keyboard navigation shared between `ContextMenu` and the menu tab.
- Column pinning, if a wide grid ever makes the name column scroll out of view.
