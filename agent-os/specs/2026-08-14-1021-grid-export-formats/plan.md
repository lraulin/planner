# Grid export formats (CSV, JSON, YAML)

**Status: frozen / complete** (2026-08-14)  
Spec folder: `agent-os/specs/2026-08-14-1021-grid-export-formats/`

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-13-1050-menu-completeness/` — File is the catalog; a declared family folds behind a submenu on every surface
- **Extends:** `agent-os/specs/2026-08-06-1010-command-surface/` — one registry, named menus, `NESTED_SECTIONS` as the fold rule
- **Supersedes:** the single File ▸ **Export as CSV** command (commit `15e4b85`, no spec folder) — replaced by File ▸ **Export ▸** CSV | JSON | YAML. Same on-screen snapshot, still owned by `DataGrid`, still menu-only.

## Context

Every `DataGrid` already dumps the current view as CSV from File. That is the right verb and the right owner; CSV is just one encoding. Spreadsheets stay flat. JSON and YAML can keep the outline the grid is showing, which CSV cannot.

This is not a new File feature and not an import path. It is the existing export, with two structured formats and the section folded the way `Convert to` and `Days` already fold.

## Decisions

1. **File ▸ Export is a declared submenu.** Add `"Export"` to `NESTED_SECTIONS`. Members are the formats: **CSV**, **JSON**, **YAML**. The name is the verb; the rows are a value picker. Three commands, so the two-command floor nests it everywhere it appears.
2. **Labels are the format names**, not "Export as CSV". The submenu (and the Commands-panel heading) already say Export. Keywords still include `export` so `⌘K` finds them.
3. **CSV is unchanged:** visible columns, on-screen node order, human-readable cell text, header-only when empty, no group headers, no nesting.
4. **JSON and YAML use the same cells**, then nest by the depth the grid is already showing. Each record is `{ [column label]: cell text }` plus `children` when the row has descendants in this snapshot. Omit `children` when empty so a flat grid is a flat array.
5. **Forest parse is the sort one.** Depth-indented runs become a tree the same way `sortRows` already does — including orphan depths after a filter dropped a mid-level parent. One helper, two callers.
6. **Empty structured export is `[]`.** CSV still writes a header row so it stays a fillable template.
7. **Still menu-only.** Not a toolbar verb, not a row action. `DataGrid` still registers the commands so Day and every other host get them without N copies. Identity-stable command list; snapshot via ref.
8. **`children` is reserved** on the structured records. A column whose header is literally "children" loses to the nest. No column today is named that.
9. **No import** of these files. Metrics/item-list CSV buttons stay where they are.

## Acceptance criteria

- [x] File ▸ Export is a submenu on every DataGrid with CSV, JSON, and YAML (desktop menu, Commands panel, phone `⋯`).
- [x] CSV download matches today's file: same columns, same rows, same filename slug + `.csv`.
- [x] JSON and YAML of a hierarchical grid (Outline) nest descendants under `children`.
- [x] JSON and YAML of a flat grid (Finances register, Contacts) are a flat array of objects with no `children` key.
- [x] Hidden columns and group headers are absent; collapsed children are absent (what is on screen).
- [x] Cell text matches the grid (compact text / filter labels, not raw codes).
- [x] Export is not on the toolbar or the row menu.
- [x] Insights (no DataGrid) still has no export.

## Changes from original plan

Material refinements during implementation (requirements, design, scope). Omit pure
code polish.

| #   | Change                      | Why |
| --- | --------------------------- | --- |
|     | _(filled during implement)_ |     |

## Task 1: Save Spec Documentation

Create `agent-os/specs/2026-08-14-1021-grid-export-formats/` with plan, shape, standards, and references. **Status: active.**

## Task 2: Shared depth forest

Extract the depth-indented parse from `sortRows.ts` into `src/lib/grid/forest.ts` and point sort at it. Export reuses the same helper.

## Task 3: Structured export + submenu

Expand `src/lib/grid/exportCsv.ts`: JSON/YAML serializers, shared filename/mime, `gridExportCommands`. Add `"Export"` to `NESTED_SECTIONS`. Register three commands from `DataGrid`.

## Task 4: Tests

Pure tests beside the modules: forest shape, nested vs flat records, YAML quoting, empty `[]`, submenu placement, CSV still round-trips. No component tests.

## Task 5: Verify, freeze spec, update roadmap

- File menu on Outline (nested) and a flat grid (register or Contacts)
- Download all three formats and read them
- Phone `⋯` shows Export ▸
- `test:unit` (2260), typecheck, lint
- Verified in the browser on the isolated worktree (`localhost:3048`): Outline File ▸ Export ▸ JSON/YAML nest `Career → Become a Programmer → Complete Free Code Camp`; register JSON is a flat `Transactions.json` with no `children`; Insights Commands panel has no Export; phone `⋯` drills into CSV / JSON / YAML.

## Follow-ups (new work — not amendments to this frozen spec)

- Import of these JSON/YAML files
- Metrics drawer / item-list CSV buttons growing the same three formats
