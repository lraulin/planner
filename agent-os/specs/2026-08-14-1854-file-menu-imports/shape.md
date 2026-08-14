# File-menu imports — Shaping Notes

**Status: frozen / complete** (2026-08-14)

## Scope

Every Settings → Import & export panel also opens from **File** on the page that owns the data. Settings stays. Finance multi-file uploads that exceed the real request-body limit are sent in sequential batches so a folder of statements does not have to be re-picked.

### Out of scope

- Removing the Settings panels
- Achieve XML on every Plan page (Outline only)
- Both note importers on both Notes pages
- Batching Tomboy / RedNotebook / Achieve / Amazon
- Raising Vercel / Next / route size ceilings
- Metrics drawer CSV on File
- Google Calendar / Contacts (Connections, not Import)
- Import of grid CSV / JSON / YAML
- File ▸ Export Achieve XML as its own command
- One command id living in two menus (Register New + File stay two ids)

## Decisions

- Keep Settings; add File on the home page
- One importer per home page (Outline / Journal / Notes Grid / Register+Statements / Orders)
- File ▸ Import is a labelled section, not a submenu (one command per page)
- Register keeps New ▸ Import transactions… and adds File ▸ Import transactions… (same dialog)
- Reuse the existing panels inside `ModalShell`
- Finance batches against the **4.5 MB Vercel body limit**, not the route’s unused 40 MB
- A single oversized file is reported and skipped; the rest still import

## Context

- **Visuals:** None
- **References:** Settings `TransferPanels`, `FinanceImportPanel` ModalShell on Register, File ▸ Export in `exportCsv.ts` / `menus.ts`, Amazon `AMAZON_UPLOAD_MAX_BYTES`
- **Product alignment:** “Own your data” and command-surface completeness. Not a new Phase 1 roadmap item.

## Standards Applied

- `components/navigation.md` — menus are the catalog; File leftmost; same label everywhere
- `components/modal-pattern.md` — File opens `ModalShell`
- `components/ux-principles.md` — modals for this kind of task
- `development/testing.md` — packer and placement tests in `src/lib`
- `development/clean-code.md` — one host, one packer
- `development/commits.md` — one logical change per commit
