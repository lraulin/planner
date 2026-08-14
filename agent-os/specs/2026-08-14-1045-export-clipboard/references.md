# References for Export to clipboard

## Governing specs

### `agent-os/specs/2026-08-14-1021-grid-export-formats/`

- **Relationship:** Extends
- **Relevant decisions:** File ▸ Export ▸ CSV / JSON / YAML; same snapshot; `children` nesting; DataGrid-owned; menu only. This delta adds a destination (file vs clipboard), not encodings.

### `agent-os/specs/2026-08-13-1050-menu-completeness/`

- **Relationship:** Extends
- **Relevant decisions:** Every non-`go` command has a `menu`. The permanent Copy to Clipboard family is what makes the Option-swap not a hidden-only path.

## Similar Implementations

### Grid export

- **Location:** `src/lib/grid/exportCsv.ts`, `src/components/grid/DataGrid.tsx`
- **Relevance:** Snapshot, serializers, command factory, ref-stable registration
- **Key patterns:** `gridExportCommands`, `serializeGridExport`, empty-deps `useMemo` + snapshot ref

### Copy as text

- **Location:** `src/lib/tree/copyAsText.ts` (`writeClipboardText`)
- **Relevance:** The one system-clipboard write. Silent. Reuse, do not add a second helper.

### Nested File families

- **Location:** `src/lib/commands/menus.ts` (`NESTED_SECTIONS`, `MENU_SECTIONS.file`)
- **Relevance:** Copy to Clipboard is the same shape as Export — a format picker
