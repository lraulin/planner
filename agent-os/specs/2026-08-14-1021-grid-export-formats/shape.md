# Grid export formats — Shaping Notes

**Status: frozen / complete** (2026-08-14)

## Scope

Turn File ▸ Export as CSV into File ▸ **Export ▸** CSV / JSON / YAML on every DataGrid.
JSON and YAML keep the on-screen hierarchy via a `children` array.

### Out of scope

- Import of JSON/YAML (or any change to CSV import)
- Exporting group headers as nodes
- Exporting hidden columns or raw field codes
- A toolbar or row-menu export
- Per-host export commands (Metrics drawer / item-list CSV buttons stay)
- Replacing Achieve's "Export to Excel" with a real `.xlsx`

## Decisions

- Export is a `NESTED_SECTIONS` family: the name is the verb, the members are formats.
- Command labels are `CSV` / `JSON` / `YAML` so the fly-out is not "Export ▸ Export as CSV".
- Structured formats share CSV's cell text and visible-column set. Only the document shape changes.
- Nesting is inferred from `depth` on the rows the grid is showing — the same forest parse sort already uses. Do not walk `node.children` on the outline model; Projects/Tasks rebase depth and drop kinds that are not rows.
- Omit empty `children` so flat catalogs stay flat documents.
- Hand-roll YAML for this record shape rather than adding a dependency. Values are already strings.

## Context

- **Visuals:** None
- **References:** `src/lib/grid/exportCsv.ts`, `src/lib/grid/sortRows.ts` (`parseForest`), `src/lib/commands/menus.ts` (`NESTED_SECTIONS`), commit `15e4b85`
- **Product alignment:** File already holds app-wide and view-export verbs (`menu-completeness`). This is that Export section growing up, not a new module.

## Standards Applied

- `components/navigation.md` — declared families fold; two-command floor; same shape on every surface; a command without a menu is not shipped
- `components/data-grid.md` — one DataGrid; hierarchy survives as depth; hosts do not reimplement grid verbs
- `development/testing.md` — logic in `src/lib`, sibling tests, no component tests
- `development/clean-code.md` — one forest parse, one export owner, lib never imports app
- `development/commits.md` — one logical change, Spec trailer
