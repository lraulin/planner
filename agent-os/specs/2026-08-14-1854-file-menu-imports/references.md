# References for File-menu imports

## Governing specs

### `agent-os/specs/2026-08-13-1050-menu-completeness/`

- **Relationship:** Extends
- **Relevant decisions:** File is the catalog on every AppShell destination. Page-specific commands register on the page. Settings stays outside the shell. Same label on menu / panel / palette / `⋯`.

### `agent-os/specs/2026-08-14-1021-grid-export-formats/`

- **Relationship:** Extends
- **Relevant decisions:** File already has an Export section that folds as a format picker. Import is the inbound counterpart but is **not** nested — each page has one importer.

### `agent-os/specs/2026-08-06-1010-command-surface/`

- **Relationship:** Extends
- **Relevant decisions:** One registry, `MENU_SECTIONS` as the taxonomy.

### Import specs (semantics unchanged)

- `agent-os/specs/2026-08-03-1518-rednotebook-journal-import/` — Settings-only input becomes File on Journal
- `agent-os/specs/2026-08-07-1946-tomboy-note-import/` — Settings-only input becomes File on Notes Grid
- `agent-os/specs/2026-08-12-1048-finances-csv-import-register/` — Register already has New + dialog; File is the missing catalog row; Statements had no in-page path
- `agent-os/specs/2026-08-14-1439-amazon-order-ingest/` — Settings-only slim JSON becomes File on Orders

## Similar implementations

### File ▸ Export commands

- **Location:** `src/lib/grid/exportCsv.ts` (`gridExportCommands`), `src/lib/commands/menus.ts`
- **Relevance:** Menu-only File section, DataGrid-owned registration, `NESTED_SECTIONS` for a value picker (Import deliberately does not nest)

### Register import dialog

- **Location:** `src/components/finances/FinancesView.tsx`
- **Relevance:** Existing `ModalShell` + `FinanceImportPanel embedded` + New ▸ Import transactions…. File shares this shell.

### Settings transfer panels

- **Location:** `src/components/settings/SettingsPage.tsx` (`TransferPanels`)
- **Relevance:** The five panels File reuses. Settings stays.

### Vercel body ceiling

- **Location:** `src/lib/amazon/types.ts` (`AMAZON_UPLOAD_MAX_BYTES`), `src/lib/http/readJson.ts`
- **Relevance:** 4.5 MB is the real request-body limit. Finance batching must pack against this, not the route’s unused 40 MB.

### Destination command bar

- **Location:** `src/components/grid/DestinationCommandBar.tsx`, `src/components/notes/NotesJournal.tsx`
- **Relevance:** Journal has File chrome but no page commands today. Pass the import command in.
