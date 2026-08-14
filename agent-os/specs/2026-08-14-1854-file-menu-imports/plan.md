# File-menu imports (and finance upload batches)

**Status: frozen / complete** (2026-08-14)  
Spec folder: `agent-os/specs/2026-08-14-1854-file-menu-imports/`

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-13-1050-menu-completeness/` — File is the catalog; page-specific commands register on the page; same label/icon/action on every surface
- **Extends:** `agent-os/specs/2026-08-14-1021-grid-export-formats/` — File already has an **Export** section; Import is the matching inbound section, not a nested format picker
- **Extends:** `agent-os/specs/2026-08-06-1010-command-surface/` — one registry, `MENU_SECTIONS` as the taxonomy
- **Extends (does not change import semantics):**
  - `agent-os/specs/2026-08-03-1518-rednotebook-journal-import/`
  - `agent-os/specs/2026-08-07-1946-tomboy-note-import/`
  - `agent-os/specs/2026-08-12-1048-finances-csv-import-register/` (and the Chase / Capital One statement deltas)
  - `agent-os/specs/2026-08-14-1439-amazon-order-ingest/`
- **Does not supersede** those import specs' parse/write/re-import rules. This spec only changes _where you start the existing panels_ and _how finance posts a large selection_.

## Context

Settings → Import & export is the only place that names Achieve XML, RedNotebook, Tomboy, and Amazon. Register already opens the transaction panel from **New ▸ Import transactions…**; Statements and Orders empty-states still say “go to Settings.” Anyone standing on the page that owns the data should find the importer under **File**, the same way they already find **File ▸ Export**.

A second, related hole: a folder of statement PDFs is a normal finance import, but the request never reaches `/api/finances/import`. The route claims 40 MB / 80 files; Next’s proxy is 30 MB; Vercel Functions 413 around **4.5 MB** (same ceiling Amazon already documents). `readJsonResponse` then reports that 4.5 MB limit. The user should pick the whole folder once; the client should send it in batches that fit.

## Decisions

1. **Settings stays.** The five Settings panels remain the dump of every importer. File on the home page is the in-context path. Empty-state copy that only mentions Settings is updated to mention File.
2. **One importer per home page.**

   | Page                  | File command          | Panel                                                                                          |
   | --------------------- | --------------------- | ---------------------------------------------------------------------------------------------- |
   | Plan → Outline        | Import Achieve XML…   | `AchieveTransferPanel` (same panel as Settings, including its export half and replace confirm) |
   | Notes → Journal       | Import RedNotebook…   | `RedNotebookImportPanel`                                                                       |
   | Notes → Grid          | Import Tomboy…        | `TomboyImportPanel`                                                                            |
   | Finances → Register   | Import transactions…  | `FinanceImportPanel`                                                                           |
   | Finances → Statements | Import transactions…  | same panel (CSV + statement PDFs)                                                              |
   | Finances → Orders     | Import Amazon orders… | `AmazonImportPanel`                                                                            |

3. **File ▸ Import is a labelled section**, inserted in `MENU_SECTIONS.file` between Plan and Export. It is **not** added to `NESTED_SECTIONS` — each page has one importer, and a single command must not hide behind a fly-out.
4. **Register keeps New ▸ Import transactions…** (catalog create — you do not type a transaction). File gets a second command with the same label and the same dialog. Two ids, one `open()`. Palette will list both; that is the cost of two menus for one action.
5. **Menu-only.** Not a toolbar icon, not a row action. Same as Export.
6. **One host, not five copies.** A small `FileImportHost` (or equivalent) registers the File command and opens `ModalShell` around the existing `embedded` panel. Register’s existing dialog is folded into it so New and File share one shell.
7. **Close refreshes the page.** Several panels do not `router.refresh()` today. The host’s `onClose` is what puts new rows on screen (Register already does this).
8. **Finance batches on the client.** Do not raise the 4.5 / 25 / 30 / 40 MB ceilings. Pack the selected files into sequential POSTs that stay under the **real** request-body limit (Vercel 4.5 MB minus multipart overhead). Tomboy / RedNotebook / Achieve / Amazon are out of this task — user named the finance route.
9. **A single file over the per-request budget still fails.** You cannot split a PDF. Report it and send the rest.
10. **Insert-or-skip makes batches safe.** A later batch that overlaps an earlier one is the same as re-importing a file.
11. **No new import formats.** Metrics drawer CSV, Google Contacts/Calendar (Connections), and grid JSON/YAML import stay out.

## Acceptance criteria

- [x] Outline File menu contains **Import Achieve XML…** and opens the existing Achieve panel in a dialog.
- [x] Notes Journal File menu contains **Import RedNotebook…**; Notes Grid contains **Import Tomboy…**.
- [x] Finances Register File menu contains **Import transactions…** and still has New ▸ Import transactions…; both open the same dialog.
- [x] Statements File menu contains **Import transactions…** (it has no import today).
- [x] Orders File menu contains **Import Amazon orders…**.
- [x] Each command also appears in the Commands panel and phone `⋯`, with the same label.
- [x] Settings → Import & export still lists all five panels.
- [x] Empty-state copy on Statements and Orders names File, not only Settings.
- [x] Selecting more finance files than one request can hold uploads them in batches, shows progress (e.g. “Importing files 12–23 of 47…”), and reports one combined created/skipped/warnings result.
- [x] A finance file larger than the per-request budget is listed as a failure; the other files still import.
- [x] A failed batch stops the queue and keeps the counts from batches that already succeeded.
- [x] `test:unit` covers batch packing and File-section placement. No React component tests. No new DB tests (write path unchanged).
- [x] Browser: File on each home page, Settings still works, Register New still works, phone `⋯` shows Import. After touching `src/app/**` (if any), `npm run smoke`.

## Changes from original plan

Material refinements during implementation (requirements, design, scope). Omit pure
code polish.

| #   | Change   | Why |
| --- | -------- | --- |
|     | _(none)_ |     |

## Task 1: Save Spec Documentation

Create `agent-os/specs/2026-08-14-1854-file-menu-imports/` with plan, shape, standards, and references. **Status: active.**

## Task 2: File ▸ Import placement

Add `"Import"` to `MENU_SECTIONS.file` between Plan and Export. Shared `fileImportCommand`. `import` glyph. Unit tests for section order and no nesting of a lone command.

## Task 3: Shared dialog host, wired to each home page

`FileImportHost` registers the File command and opens `ModalShell` around the existing panel. Wire Outline, Journal, Notes Grid, Register (share with New), Statements, Orders. Update empty-state copy.

## Task 4: Finance client-side batches

Pack selected files under the Vercel 4.5 MB ceiling (minus multipart overhead). Sequential POSTs. Combined result. Do not change the route.

## Task 5: Verify, freeze spec, update roadmap

Verified 2026-08-14: `test:unit` 2421; typecheck; lint. Browser at 1280×800 (File on Outline / Journal / Notes Grid / Register / Statements / Orders; Register New; Settings still has all five) and 390×844 (Statements and Journal `⋯`). Finance batching proved by `packFileBatches` tests against the 4 MB budget; no live folder was re-imported this pass. No `src/app/**` change, so smoke was not required.

### Follow-ups (new work — not amendments to this frozen spec)

- Batch Tomboy / RedNotebook the same way if a real archive ever exceeds their totals.
- File ▸ Export Achieve XML as a sibling of grid CSV/JSON/YAML (Settings already exports).
- Metrics drawer CSV Import… on File.
- Deduping Register’s New + File commands into one id (would require a command that can live in two menus).
