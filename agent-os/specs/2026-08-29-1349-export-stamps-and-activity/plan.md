# Export timestamps and Activity evidence export

**Status: active**  
Spec folder: `agent-os/specs/2026-08-29-1349-export-stamps-and-activity/`

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-14-1021-grid-export-formats/` — same four encodings, still owned by `DataGrid` for grids, still menu-only.
- **Extends:** `agent-os/specs/2026-08-14-1045-export-clipboard/` — Option-swap and `File ▸ Copy to Clipboard ▸` stay; clipboard text is the same document as the download, so it receives the body stamp too.
- **Extends:** `agent-os/specs/2026-08-28-0759-budget-single-export/` — Budget remains one document; it gains the stamp on that document. Movement log still stays out of the Budget export.
- **Extends:** `agent-os/specs/2026-08-29-0845-bank-snapshots-finance-audit/` — `/finances/activity` stays the read-only audit surface. This delivers that spec's follow-up: "Add a dedicated Activity export if audit evidence needs to leave Planner."
- **Extends:** `agent-os/specs/2026-08-02-0912-metrics-tab/` — tracking CSV stays CSV-only and still round-trips; the file is stamped and import skips the preamble.
- **Supersedes:** `agent-os/specs/2026-08-14-1021-grid-export-formats/` D3 (CSV starts at the header row) and D4/D6 (JSON/YAML top-level is the row array / empty `[]`) — every serialized export is now a stamped document. `tableToCsv` / `tableToJson` / `tableToYaml` stay unstamped table primitives.

## Context

Register and budget numbers are back to $0 after the watermark/feed-ownership work. Activity is the trail that should make the next money mystery reconstructable _outside_ Planner — a chat, a note, a downloaded file. Two gaps sit in the way:

1. **Exports have no when.** Grid and Budget filenames are a slug (`Outline.json`, `Budget_September_2026.md`). Clipboard copies have no filename at all. Achieve XML stamps a UTC calendar date only (`planner-export-2026-08-29.achxml`), which is the wrong kind of value: export time is an instant, and `toISOString().slice(0, 10)` is the dates-standard trap that can put yesterday's evening on tomorrow's date.
2. **Activity's evidence cannot leave the drawer.** `/finances/activity` is already a `DataGrid`, so `File ▸ Export ▸` / `Copy to Clipboard ▸` already dump the six summary columns (time, action, origin, account, budget month, impact). Checkpoints, normalized changes, and source evidence live only in `ActivityDrawer`.

Five download families exist; only grids and Budget share `exportFilename` / `downloadTextFile`. Achieve XML, `ItemList.tsx`, and `MetricDrawer.tsx` each roll their own `Blob` + slug.

## Decisions

### D1 — Filename stamp is local, filename-safe, and an instant

`exportFilename(label, extension, at)` writes `{slug}_{yyyy-MM-dd'T'HHmmssxx}.{ext}`.

- Example: `Finance_Activity_2026-08-29T134136-0400.csv`
- No colons (Windows). Offset from the local timezone, not a UTC date. The same `Date` is used for the body stamp.
- `at` is injected so tests pin the clock. Callers pass `new Date()`.
- Grid formats still map through `FORMAT_EXTENSION` (`markdown` → `.md`). Achieve passes `achxml`.

### D2 — Every format's document body carries the same instant (including clipboard)

Clipboard copies have no filename, so a stamp that lives only in the name does not stamp a paste. Serializers wrap or preamble the existing payload; `tableTo*` stay unstamped.

| Format      | Body stamp                                                                                                                                                                 |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CSV         | Title line, `Exported {iso}` line, blank line, then the existing table. Matches Budget's stacked-report shape, now used by grids too.                                      |
| Markdown    | `# {title}` then `Exported {iso}` then the existing table/document.                                                                                                        |
| JSON        | Envelope `{ exportedAt, title, rows }` (Budget: add `exportedAt` to the existing object; do not wrap it again). Empty grid is `{ exportedAt, title, rows: [] }`, not `[]`. |
| YAML        | Same envelope as JSON.                                                                                                                                                     |
| Achieve XML | `<!-- Exported {iso} -->` after the XML declaration, _before_ `<AchieveDB>`. `parseAchXml` only walks the AchieveDB body, so import still round-trips.                     |

`exportedAt` in the body is ISO-8601 with a colon offset (`2026-08-29T13:41:36-04:00`). Same instant as the filename, different spelling because filenames cannot have colons.

This is a contract change for anyone who parsed grid JSON as a top-level array. There is no public consumer; Lee's own files from last week would need to read `.rows`. Stated rather than buried.

### D3 — Round-trip CSVs skip the preamble on import

Metrics tracking CSV and detail `ItemList` CSV are exported _and_ imported. Stamping the body without teaching the parsers would make "export then import" fail looking for `Date`/`Value` in the title line.

`parseEntriesCsv` / `parseItemsCsv` skip leading rows until a recognized header. A file with no preamble still imports. Grid/Budget/Activity CSVs have no importer.

### D4 — Activity list export stays; the new work is one open event's evidence

The grid already exports its six summary columns (and will pick up D1/D2 for free). Do not replace that with a bulk evidence dump.

When an Activity row is open and loaded, `File ▸ Export Event ▸` and `File ▸ Copy Event to Clipboard ▸` write that event's drawer contents: summary, warnings, checkpoints, ordered changes, source evidence (including the exact bank snapshot when present). Same four encodings, same Option-swap, same stamp.

- Command ids: `activity.export-{format}` / `activity.copy-{format}` — not `grid.export-*`, so they do not last-wins against the list export.
- Add `"Export Event"` and `"Copy Event to Clipboard"` to `MENU_SECTIONS.file` (after the existing Export/Copy pair) and to `NESTED_SECTIONS`. Declared families fold; a length-derived rule would nest on Activity and lie flat everywhere else.
- Unavailable is **disabled with the reason** "Open an Activity entry first", never absent.
- Menu only: not a toolbar verb, not a drawer-only button. The drawer is read-only evidence; File is the catalog (`navigation.md`).
- Below `md`, `⋯` already renders File.

### D5 — Event evidence is a document, not a sixth export family

Pure `src/lib/finances/audit/export.ts`, modelled on `src/lib/finances/budget/export.ts`: a title, sections, then the shared serializers. JSON/YAML nest; CSV/Markdown stack.

| Section              | What it carries                                                                                      |
| -------------------- | ---------------------------------------------------------------------------------------------------- |
| Summary              | Time, action, origin, batch, headline, accounts, budget months                                       |
| Warnings & decisions | The event's warning strings, or omitted when empty                                                   |
| Money checkpoints    | Before → after for account pool, selected pending, each account, each budget month and its envelopes |
| Normalized changes   | Entity type, identity, before JSON, after JSON. "Successful no-op." when empty                       |
| Source evidence      | Exact bank snapshot text when present, plus the stored `sourceEvidence` JSON                         |

Credentials, cookies, and full card numbers are already excluded from what is stored; the export dumps what the drawer already shows.

### D6 — The three hand-rolled downloaders move onto the shared helpers

Achieve XML, `ItemList` CSV, and `MetricDrawer` CSV keep their current formats and in-form buttons (growing them to four encodings + clipboard is the frozen follow-up on `2026-08-14-1021-grid-export-formats`, not this spec). They stop rolling their own `Blob` + slug and call `exportFilename` + `downloadTextFile`. Achieve's route uses the same filename helper; it cannot call `downloadTextFile` (it is a `Content-Disposition` response).

### D7 — One clock, one slugger, no second YAML/CSV implementation

Stamp formatting, filename composition, and the CSV/Markdown preamble live next to `exportFilename` in `src/lib/grid/exportCsv.ts` (or a sibling `exportStamp.ts` if the file would otherwise grow a second concern). Budget, Activity, grids, items, and metrics call it. No new date library; this is an instant, so it does not go through UTC-noon helpers.

## Out of scope

- Import of grid/Budget/Activity JSON/YAML/Markdown.
- Growing Metrics / ItemList buttons to JSON, YAML, Markdown, or clipboard.
- Bulk export of many Activity events' evidence in one file.
- Audit-based undo, public HTTP/MCP audit API.
- A toast for clipboard writes (still silent, per `2026-08-14-1045-export-clipboard` D7).
- Putting the Budget movement log into the Budget export (explicitly out of `2026-08-28-0759-budget-single-export` D3; Activity is the trail).

## Acceptance criteria

- [ ] `exportFilename("Outline", "json", pinnedDate)` is `Outline_2026-08-29T134136-0400.json` (or the pinned instant's local equivalent): no colons, offset present, not a UTC calendar date.
- [ ] `File ▸ Export ▸` on Outline, Register, Budget, and Activity writes that stamp into the filename _and_ the file body in all four encodings. Clipboard copies of the same format contain the body stamp and match the download aside from being a string instead of a file.
- [ ] Grid JSON/YAML parse as `{ exportedAt, title, rows }`. Budget JSON gains `exportedAt` on the existing object. Empty grid JSON is not `[]`.
- [ ] `/finances/activity` still exports the six on-screen columns from `File ▸ Export ▸`. With a row open, `File ▸ Export Event ▸` / `Copy Event to Clipboard ▸` dump that event's checkpoints, changes, and source evidence. With no row open those commands are present and disabled: "Open an Activity entry first."
- [ ] Achieve XML filename is `planner-export_{stamp}.achxml` and the file contains `<!-- Exported {iso} -->` before `<AchieveDB>`. Re-import still loads.
- [ ] Metrics tracking and ItemList: export uses `downloadTextFile` + stamped filename + CSV preamble; export-then-import still loads the rows. A preamble-less file still imports.
- [ ] Unit tests cover stamp spelling, envelope/preamble, Activity document contents, parser skip, and Achieve comment placement. No React component tests.
- [ ] After any `src/app/**` touch (Achieve route), `npm run smoke` against a running dev server. Browser: Outline export, Budget export, Activity list export, Activity event export and copy, Metrics export-then-import, at 1280 and 390.

## Changes from original plan

Material refinements during implementation (requirements, design, scope). Omit pure
code polish.

| #   | Change                      | Why |
| --- | --------------------------- | --- |
|     | _(filled during implement)_ |     |

## Task 1: Save Spec Documentation

Create this folder with plan, shape, standards, and references. **Status: active.** Pin standards commit `b48a3649baaa98c551b6ee2aac18d0d0166ac322`.

While this spec is **active**, when we make a material change to requirements, design, or scope (including from feedback on what was implemented), update the relevant sections and append to **Changes from original plan**. Skip pure implementation details. Freeze when verified.

## Task 2: Shared stamp + filename

- `formatExportStamp(at)` → filename token and body ISO.
- `exportFilename(label, extension, at)` includes the token.
- `stampExportBody(format, { title, exportedAt, payload })` for CSV/Markdown preamble and JSON/YAML envelope.
- Keep `tableTo*` unstamped.
- Tests pin a `Date` and assert no colons, local offset, envelope shape, empty-grid envelope.

## Task 3: Apply the stamp to grid and Budget exports

- `serializeGridExport` / `serializeBudgetExport` take `exportedAt` (and grid title).
- `DataGrid` and `BudgetView` pass `new Date()` into serialize + `exportFilename`.
- Existing export/copy tests updated for the envelope/preamble. Budget JSON keeps `title` / `headline` / `sections` and adds `exportedAt`.

## Task 4: Activity event evidence export

- Pure document builder + serializer in `src/lib/finances/audit/export.ts` with tests (checkpoint before/after, no-op changes, bank snapshot text, stamp).
- `ActivityView` registers `activity.export-*` / `activity.copy-*`. Disabled reason when no event is loaded.
- Declare `"Export Event"` and `"Copy Event to Clipboard"` in `MENU_SECTIONS.file` and `NESTED_SECTIONS`.
- `downloadTextFile` / `writeClipboardText` — same as Budget. Drawer stays read-only; no extra buttons.

## Task 5: Migrate the three hand-rolled downloaders

- Achieve route: shared filename; XML comment before `<AchieveDB>`; parse test that a stamped file still imports.
- `ItemList` / `MetricDrawer`: `downloadTextFile` + stamped filename + CSV preamble via the shared helper.
- `parseItemsCsv` / `parseEntriesCsv` skip leading non-header rows. Tests: preamble present, preamble absent, malformed header still errors.

## Task 6: Verify, freeze spec, update roadmap

- `npm run test:unit`; integration only if a mutation changed (it should not).
- Typecheck, lint.
- `npm run smoke` if `src/app/**` changed.
- Browser: Outline, Budget, Activity list, Activity event (export + copy), Metrics export-then-import; desktop and phone `⋯`.
- Update `plan.md` / `shape.md` for as-built drift; fill **Changes from original plan**.
- Mark **Status: frozen / complete** (date).
- Roadmap: under the Finance Activity bullet and the own-your-data export line, note stamped exports + Activity evidence export.
- Follow-ups that are _not_ this spec: Metrics/ItemList growing the four encodings; bulk Activity evidence; clipboard toast.
