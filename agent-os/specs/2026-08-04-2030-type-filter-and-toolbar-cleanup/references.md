# References

**Status: frozen / complete** (2026-08-04)

## Achieve Planner

The behaviour this reproduces was established by the user experimenting in AP directly:
_"if you show something, you have to show its ancestors no matter what."_ Recorded here
because `docs/achieve-planner/` does not state it — the manual describes the Icon column and
the filters, not what filtering does to the tree.

**Where we deliberately differ:** AP renders type icons in a flat `Icon` column and leaves the
tree as bare indented text. We put the glyph in the Name cell by default because it
establishes the identity of the row where you are already reading, and it carries to the
Projects / Tasks / Goals tabs, which AP does not even offer the column on. Showing the `icon`
column reproduces AP's layout exactly.

## In-repo prior art leaned on

| Concern                       | Where                                                                                                 |
| ----------------------------- | ----------------------------------------------------------------------------------------------------- |
| Filter pipeline and `passIds` | `src/components/grid/DataGrid.tsx` — the one place narrowing is decided                               |
| Positional tree walking       | `dropEmptyGroups` in the same file, which already counts a subtree by row order + depth               |
| A grid-wide fact via context  | `src/components/grid/rowDragContext.ts` — same shape, same reason                                     |
| Value-vs-label on a filter    | `abbrStateColumn`'s `filterLabel` (`NS` → `Not started`), copied for `result_area` → `Result Area`    |
| Kind vocabulary               | `src/lib/tree/hierarchy.ts` — `NODE_KINDS`, `KIND_LABELS`, `kindOfNode` (Dream is a Goal with a flag) |
| Pre-grid tree reshaping       | `OutlineGrid`'s `visible` walk, which `showCompleted` still uses                                      |

## Files changed

```
src/lib/grid/ancestors.ts              (new) ancestor closure for a filtered tree
src/lib/grid/ancestors.test.ts         (new)
src/components/grid/nameIconContext.ts (new) where the one type glyph is drawn
src/components/grid/DataGrid.tsx       ancestor closure in passIds; provides NameIconContext
src/components/grid/cells.tsx          NameCell honours the context
src/components/grid/commonColumns.tsx  typeColumn(); iconColumn() gains filterLabel + sort
src/components/grid/GridToolbar.tsx    Clear filters removed; DensityToggle
src/components/outline/OutlineGrid.tsx type + focus toggles removed; visible walk simplified
src/components/outline/outlineColumns.tsx  offers typeColumn()
src/components/tabs/ProjectsGrid.tsx   offers typeColumn()
src/components/tabs/GoalsGrid.tsx      offers typeColumn()
src/lib/settings/outline.ts            types / focusOnly retired, blobs still parse
src/lib/settings/outline.test.ts
agent-os/standards/components/data-grid.md
```
