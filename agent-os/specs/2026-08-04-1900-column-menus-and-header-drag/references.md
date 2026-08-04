# References

**Status: frozen / complete** (2026-08-04)

## External (supplied with the ask)

- AG Grid — [Column Menu / menu items](https://www.ag-grid.com/javascript-data-grid/component-menu-item/).
  Source of the **tabbed** menu idea and of the item vocabulary (sort, pin, autosize, reset).
- MUI X Data Grid — [Column menu](https://mui.com/x/react-data-grid/column-menu/). Source of
  the shorter, more opinionated item list: sort asc / desc / unsort, filter, hide, manage
  columns. Ours is closer to this than to AG Grid's.

Neither library is adopted — see "Why hand-rolled" in `standards/components/data-grid.md`.

## In-repo prior art leaned on

| Concern                             | Where                                                                                 |
| ----------------------------------- | ------------------------------------------------------------------------------------- |
| Menu item vocabulary and rendering  | `src/components/grid/ContextMenu.tsx` — same `MenuItem` type, same label/shortcut row |
| Popover edge-flip measurement       | The pre-existing `FilterButton` in `ColumnHeader.tsx`, kept verbatim in `ColumnMenu`  |
| HTML5 drag with an insertion marker | `src/components/grid/ShowFieldsDialog.tsx` (list drag), `DataGrid.tsx` (row drag)     |
| Drop-slot arithmetic                | `src/lib/grid/fieldOrder.ts` `placeField` — reused rather than reimplemented          |
| Column set / order persistence      | `src/components/grid/useGridState.ts` — `show` / `hide` / `move` / `place` / `reset`  |

## Files changed

```
src/lib/grid/columnMenu.ts            (new) availability rules + drag slot
src/lib/grid/columnMenu.test.ts       (new)
src/components/grid/ColumnMenu.tsx    (new) tabbed popover; filter panel moved in
src/components/grid/ColumnHeader.tsx  header drag, right-click, one open menu, one dialog
src/components/grid/columns.ts        ColumnControls
src/components/grid/ContextMenu.tsx   MenuItem.title
src/components/grid/DataGrid.tsx      onSetSort, columnControls
src/components/grid/useGridState.ts   setSort, columnControls
src/components/grid/index.ts          exports
src/components/day/dayColumns.tsx     fieldLabel on the tick-box column
+ the eight DataGrid call sites
agent-os/standards/components/data-grid.md
```
