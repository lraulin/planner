# References for Export timestamps and Activity evidence export

## Governing specs

### `agent-os/specs/2026-08-14-1021-grid-export-formats/`

- **Relationship:** Extends the four encodings, menu-only ownership, and `tableTo*`
  primitives. **Supersedes** D3 (CSV starts at the header) and D4/D6 (JSON/YAML top-level is
  the row array / empty `[]`) for serialized downloads only.
- **Relevant decisions that carry:** D1 File ▸ Export is a declared submenu; D7 identity-stable
  command list via snapshot ref; D9 no import of these files. Follow-up "Metrics drawer /
  item-list CSV buttons growing the same three formats" stays a follow-up.

### `agent-os/specs/2026-08-14-1045-export-clipboard/`

- **Relationship:** Extends.
- **Relevant decisions:** D2/D3 Option-swap plus permanent Copy to Clipboard; D7 clipboard
  writes are silent. Clipboard text must match the download of the same format, so it
  receives the body stamp. The Activity event family copies this shape with distinct ids
  and section names.

### `agent-os/specs/2026-08-28-0759-budget-single-export/`

- **Relationship:** Extends.
- **Relevant decisions:** D1 one document for the page; D3 movement log stays out of the
  Budget export (Activity is the trail); D5/D6 stacked CSV and keyed JSON object — Budget
  already has a title line, so it gains `exportedAt` on that object rather than a second
  wrapper. D4 Markdown on the shared list.

### `agent-os/specs/2026-08-29-0845-bank-snapshots-finance-audit/`

- **Relationship:** Extends. Delivers the listed follow-up "Add a dedicated Activity export
  if audit evidence needs to leave Planner."
- **Relevant decisions:** D3 append-only finance audit is evidence, not another ledger; D4
  `/finances/activity` is the read-only surface and the drawer already shows checkpoints,
  changes, and source evidence. Export dumps what the drawer shows; it does not grow new
  fields.

### `agent-os/specs/2026-08-02-0912-metrics-tab/`

- **Relationship:** Extends.
- **Relevant decisions:** tracking CSV export/import round-trips. D3 of this spec exists so
  that decision survives a preamble.

### `agent-os/specs/2026-08-13-1050-menu-completeness/`

- **Relationship:** Extends.
- **Relevant decisions:** File is the catalog; a declared family folds behind a submenu on
  every surface. `"Export Event"` and `"Copy Event to Clipboard"` must be added to
  `MENU_SECTIONS.file` and `NESTED_SECTIONS` the same way Export was.

## Similar implementations

### Shared grid exporter

- **Location:** `src/lib/grid/exportCsv.ts`; download in
  `src/components/grid/downloadCsv.ts`; registration in
  `src/components/grid/DataGrid.tsx`.
- **Relevance:** `exportFilename`, `serializeGridExport`, `gridExportCommands` /
  `gridCopyCommands` are the helpers every other family should call. `tableToCsv` /
  `tableToJson` / `tableToYaml` / `tableToMarkdown` stay the unstamped table layer.
- **Key patterns:** Command list built once, snapshot via ref, so `columns` / `displayRows`
  are not deps. Clipboard via `writeClipboardText`.
- **What changes:** `exportFilename` takes the instant; `serializeGridExport` stamps.

### Budget whole-page export

- **Location:** `src/lib/finances/budget/export.ts`; registration in
  `src/components/finances/budget/BudgetView.tsx`.
- **Relevance:** The document-of-sections shape Activity event evidence copies. Already a
  keyed JSON object, so it adds `exportedAt` rather than wrapping. Grids pass
  `exportCommands={false}` and the page registers File ▸ Export — Activity does the
  inverse: the grid keeps list export, the page _adds_ the event family.

### Finance Activity page and drawer

- **Location:** `src/components/finances/activity/ActivityView.tsx`,
  `ActivityDrawer.tsx`, `activityColumns.tsx`; types in
  `src/lib/finances/audit/types.ts`.
- **Relevance:** The grid already exports six summary columns. The drawer already renders
  every field the event document must contain (checkpoint rail, changes, source evidence
  including `planner-bank-snapshot-v1` raw text). The exporter is that rendering as data,
  not a second description of the event.

### Hand-rolled downloaders being migrated

- **Achieve XML:** `src/app/api/achieve/export/route.ts` (`planner-export-${date}.achxml`)
  and `src/lib/achieve/exportXml.ts` (`<AchieveDB>` root). Stamp is an XML comment before
  the root; `parseAchXml` in `src/lib/achieve/parseXml.ts` walks only the AchieveDB body.
- **ItemList CSV:** `src/components/detail/ItemList.tsx` Blob+slug;
  `src/lib/detail/itemCsv.ts` `itemsToCsv` / `parseItemsCsv`.
- **Metric tracking CSV:** `src/components/metrics/MetricDrawer.tsx` Blob+slug;
  `src/lib/metrics/csv.ts` `entriesToCsv` / `parseEntriesCsv`. Header must include Date and
  Value; that is what the preamble-skip looks for.

### Command catalog

- **Location:** `src/lib/commands/menus.ts` (`MENU_SECTIONS.file`, `NESTED_SECTIONS`).
- **Relevance:** Export and Copy to Clipboard are already declared nested File sections.
  Export Event / Copy Event to Clipboard are the same shape with different names so they
  do not collide with the list export on Activity.
