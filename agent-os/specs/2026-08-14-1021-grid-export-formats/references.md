# References for Grid export formats

## Governing specs

### `agent-os/specs/2026-08-13-1050-menu-completeness/`

- **Relationship:** Extends
- **Relevant decisions:** File is the leftmost catalog; every non-`go` command has a `menu`; same label/icon/action on every surface. Export already lives in File's Export section.

### `agent-os/specs/2026-08-06-1010-command-surface/`

- **Relationship:** Extends
- **Relevant decisions:** `NESTED_SECTIONS` is declared, not derived from length. Fold value-pickers (`Convert to`, `Days`, `State`); leave verb families flat.

### File ▸ Export as CSV (commit `15e4b85`)

- **Relationship:** Superseded in the single-command sense; the snapshot rules carry forward
- **Relevant decisions:** `DataGrid` owns the command; visible columns; filtered/sorted node rows; no group headers; identity-stable registration via a snapshot ref; menu only

## Similar Implementations

### Current CSV export

- **Location:** `src/lib/grid/exportCsv.ts`, `src/components/grid/DataGrid.tsx`, `src/components/grid/downloadCsv.ts`
- **Relevance:** The snapshot, filename slug, cell-text rules, and registration pattern. JSON/YAML are more encodings of the same snapshot.
- **Key patterns:** `exportCellText` / `exportableColumns` / `tableToCsv`; `gridExportCommands`; ref + empty-deps `useMemo`

### Depth forest (sort)

- **Location:** `src/lib/grid/sortRows.ts` (`parseForest`)
- **Relevance:** Hierarchy on screen is depth in the prepared list, not the outline model's children. Export must use the same parse or a filter that dropped a parent will nest differently than the grid.
- **Key patterns:** base depth = min of the run; orphan jumps attach to the nearest open ancestor

### Nested command families

- **Location:** `src/lib/commands/menus.ts` (`NESTED_SECTIONS`, `section()`)
- **Relevance:** Export becomes a family in that set. A single remaining command would stay flat (the two-command floor).
- **Key patterns:** `"Days"`, `"Convert to"`, `"State"` — name is the useful thing
