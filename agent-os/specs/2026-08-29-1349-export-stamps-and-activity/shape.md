# Export timestamps and Activity evidence export — Shaping notes

**Status: frozen / complete** (2026-08-29)

## Scope

Stamp every export — filename and document body, including clipboard copies — with the instant
it was made. Add a File-menu export of one open Finance Activity event's drawer evidence
(checkpoints, normalized changes, source evidence). Move the three hand-rolled Blob+slug
downloaders onto the shared helpers while stamping.

### Out of scope

- Import of grid / Budget / Activity JSON, YAML, or Markdown.
- Growing Metrics drawer / ItemList CSV buttons to the four encodings and clipboard (frozen
  follow-up on `2026-08-14-1021-grid-export-formats`).
- Bulk export of many Activity events' evidence in one file.
- Audit-based undo, a public audit API, or putting the Budget movement log into the Budget
  export.

## Decisions

Recorded in full in `plan.md` as D1–D7. In brief: the filename stamp is a local instant without
colons (D1); every encoding including clipboard carries the same instant in the body, which
means JSON/YAML wrap in an envelope and CSV/Markdown take a preamble (D2); round-trip CSV
importers skip that preamble (D3); Activity keeps its list export and adds a separate Export
Event family for one open row's evidence (D4–D5); Achieve XML, ItemList, and MetricDrawer
adopt the helpers without growing formats (D6); one clock and one slugger (D7).

## Why the obvious alternatives lose

- **Filename-only stamp.** Clipboard copies have no filename. The original request was "in
  the filename…and maybe also in the text"; the user then chose every format. A paste into a
  note that cannot say _when_ it was copied is the bug this exists to close.
- **UTC calendar date in the filename** (`toISOString().slice(0, 10)`). Achieve already does
  this. Export time is an instant, not a calendar day, and a US-evening export can land on
  tomorrow's UTC date. That is the dates-standard trap.
- **JSON comment or a leading `_meta` row.** JSON has no comments. A `_meta` object as the
  first array element would be parsed as a row. An envelope `{ exportedAt, title, rows }` is
  the only valid JSON that stamps a document without lying about its rows.
- **Steal File ▸ Export while the drawer is open.** Budget did that because the page _is_ one
  document. Activity's list and an event's evidence are different documents; last-wins on
  `grid.export-csv` is how Budget used to export a third of itself. Distinct ids and a
  distinct File section keep both.
- **Drawer-only Export button.** A command without a menu is not shipped. The drawer is
  read-only evidence; File is the catalog.
- **Replace the Activity grid export with a bulk evidence dump.** The grid already exports
  its six summary columns, which is the right snapshot of the log. The gap is the drawer.

## The shape of the answer

A **shared stamp** (instant → filename token + body ISO + preamble/envelope) applied by every
serializer that currently produces a download or a clipboard copy. Grids and Budget pick it
up by changing `serialize*` and `exportFilename`. Activity event evidence is a Budget-like
sectioned document of one `FinanceAuditEvent`. The three Blob+slug copies die.

## Context

- **Visuals:** None. The new chrome is two File submenus (`Export Event`, `Copy Event to
Clipboard`) that fold the same way Export already does.
- **References:** See `references.md`.
- **Product alignment:** Mission "own your data"; Finance Activity follow-up from
  `2026-08-29-0845-bank-snapshots-finance-audit`.
- **Shaping origin:** Claude session `cb172c50-c17c-4bcd-9c32-04005b17d4b8` hit a session
  limit while writing the plan. Product answers confirmed there: stamp every format; drawer
  is one event's evidence; migrate all three hand-rolled downloaders.
