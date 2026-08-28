# One Budget export

**Status: frozen / complete** (2026-08-28)  
Spec folder: `agent-os/specs/2026-08-28-0759-budget-single-export/`

## Spec relationships

- **Supersedes:** `agent-os/specs/2026-08-14-1021-grid-export-formats/` D1 — the format list is
  four, not three. Markdown joins CSV / JSON / YAML on every `DataGrid`.
- **Supersedes:** the scoped per-grid Budget export (commit `eeeae93`, no spec folder) and
  `src/lib/finances/budget/gridScopes.ts` with it. Budget exports one document, so there is
  nothing left to disambiguate.
- **Extends:** `agent-os/specs/2026-08-14-1045-export-clipboard/` — the Option-swap and the
  permanent `File ▸ Copy to Clipboard ▸` submenu are unchanged, now with a fourth format.
- **Extends:** `agent-os/specs/2026-08-23-2313-one-budget/` — Income, Spending and Savings are
  one page; export follows.

## Context

The Budget page renders three `DataGrid`s — Regular spending, Bills, Savings — and each one
publishes its own `File ▸ Export`. Command ids are unique across the merged catalog, so three
grids publishing `grid.export-csv` is last-wins; `gridScopes.ts` stamped a `CommandScope` on
each to stop that. The result on File is `CSV`, `CSV — Regular spending`, `CSV — Bills`,
`CSV — Savings`, where the unscoped row silently means "whichever table has the focus ring".
Four ways to export a third of the page.

And the parts of the Budget that are not a grid cannot be exported at all: Ready to Assign and
the terms that make it, Income, the section subtotals, and both forecast panels.
`exportableColumns` only ever sees the three grids' visible node rows.

The budget is one document, so export produces one file.

## Decisions

1. **One export, the whole page.** `File ▸ Export ▸` on Budget yields a single document
   covering the month: summary, income, the three tables, and the two forecast panels. The
   three `DataGrid`s pass `exportCommands={false}`; `BudgetView` registers the commands.
2. **Per-table export is gone.** No scoped rows, no focused-table rule. `gridScopes.ts` and
   the `commandScope` / `exportFocused` props on `DataGrid` are deleted — Budget was the only
   caller.
3. **Backlog and the movement log stay out.** The backlog spans the whole budget, not the
   month on screen, and the movement log is an audit trail rather than a statement of the
   budget. Both are one line of the page; neither is what someone exports a month for.
4. **Markdown joins the shared format list**, not a Budget-only parallel enum. A second list
   shadowing `GRID_EXPORT_FORMATS` with one extra member is the duplication that rots;
   `tableToMarkdown` beside `tableToCsv` is less code. Consequence, stated rather than buried:
   every other grid gains `File ▸ Export ▸ Markdown` and `Copy Markdown to Clipboard`.
5. **CSV stacks sections.** Title line, then per section a title row, an optional caption row,
   a header row, its rows, a blank line. A single CSV cannot hold a heterogeneous document as
   one table without a `Section` column that leaves the summary and forecast rows sitting in
   grid columns they do not belong to. Stacked sections read as a report in Excel, which is
   what File ▸ Export to Excel… was for.
6. **JSON and YAML are one object, not an array** — `{ title, headline, sections }`. A
   whole-page export has a headline (`Ready to Assign`) that is not a row of any table, so the
   top level cannot be the row array the per-grid export produces.
7. **Section rows carry a depth**, so `parseDepthForest` nests them in JSON/YAML exactly as it
   does for a hierarchical grid. That is what makes `Next 12 months` items sit under their
   month without a second nesting implementation.
8. **Cell text is what the screen shows.** Visible columns only, `compactText` cells, on-screen
   node rows including the `show hidden` switch. Dates go through the caller's
   `useDateFormatter` so the export matches the user's date setting rather than inventing a
   second format.
9. **Still menu-only**, still `File ▸ Export ▸` and `File ▸ Copy to Clipboard ▸`, still no
   toolbar verb and no row action.

## What the document contains

| Section            | Columns                                           | Source                                                                                                            |
| ------------------ | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Summary            | `Term`, `Amount`                                  | headline `month.readyToAssignCents`; rows `month.terms`; account-pool caption when the current month is on screen |
| Income             | `Envelope`, `Activity`                            | `sections.income`; `Received … · Expected …/mo` caption                                                           |
| Regular spending   | that grid's visible columns                       | `envelopeGridRows` node rows; `envelopeTotals` caption                                                            |
| Bills              | that grid's visible columns                       | `billGridRows`; `billTotals` caption                                                                              |
| Savings            | that grid's visible columns                       | `savingsGridRows`; `savingsTotals` caption                                                                        |
| Expected vs income | `Line`, `Monthly`, `A year`                       | `forecast.comparison` — bills, expected income, remainder                                                         |
| Next 12 months     | `Month`, `Item`, `Amount`, `Date`, `Above median` | `forecast.months`; bucket rows at depth 0, their items at depth 1                                                 |

The combined Spending total rides on the `Regular spending` caption's sibling — a `Spending`
line in the Summary section — so the figure that has to be believed appears once.

## Acceptance criteria

- [x] `File ▸ Export ▸` on Budget shows exactly CSV, JSON, YAML, Markdown — no `— Bills`,
      `— Savings` or `— Regular spending` rows, and clicking a table does not change them.
- [x] One downloaded file carries Ready to Assign with its terms, Income, all three tables with
      their subtotals, Expected vs income, and Next 12 months.
- [x] Hiding a column on Bills drops it from that section only. Verified in the browser:
      Activity left the Bills table and stayed on Regular spending and Savings.
- [x] `Next 12 months` items nest under their month in JSON and YAML and stay flat in CSV.
- [x] Option over `Export ▸` still swaps to `Copy … to Clipboard`; the permanent
      `Copy to Clipboard ▸` submenu carries the same four formats. `Copy CSV to Clipboard`
      on Budget put the whole document on the clipboard.
- [x] Every other grid (Register, Outline, Contacts) gains Markdown and still exports its own
      view in the other three formats. Checked on `/finances/register`.
- [x] `gridScopes.ts` and the `DataGrid` `commandScope` / `exportFocused` props are gone.

## Changes from original plan

| #   | Change                                                                                      | Why                                                                                                                                                                                                                                                             |
| --- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | A section column is `{ label, align? }`, not a bare string.                                 | Markdown right-aligns money, and which columns are money is not "all but the first" — `Next 12 months` has a text `Date` after its `Amount`. The alignment has to travel with the header, and a grid column already declares it.                                |
| 2   | `exportFilename` gained a `FORMAT_EXTENSION` map so `markdown` writes `.md`.                | The format name was the extension, which would have shipped `Budget_August_2026.markdown`. Applies to every grid's Markdown download.                                                                                                                           |
| 3   | `tableToMarkdown` takes an optional `indent` accessor.                                      | A Markdown table cannot nest, but the forecast is a tree and a flat list of month rows and bill rows is unreadable. Grids pass nothing and stay flat, so this changes no existing export.                                                                       |
| 4   | Summary carries `Ready to Assign` and three `Spending …` rows after the terms.              | The headline is not a row of any table, and a CSV section that lists the terms without the figure they sum to cannot be checked. Spending rides here rather than on a table caption so the combined total still appears exactly once (D4 of `2026-08-26-2159`). |
| 5   | `budgetTotals` for the three sections moved above `BudgetView`'s `if (!month) return null`. | The document is a `useMemo`, so everything it reads has to be computed before the early return.                                                                                                                                                                 |

## Task 1: Save spec documentation — done

This folder.

## Task 2: Markdown in the shared exporter — done

`tableToMarkdown` in `src/lib/grid/exportCsv.ts`, `markdown` in `GRID_EXPORT_FORMATS`,
`FORMAT_LABEL`, `FORMAT_MIME` and `serializeGridExport`. Tests beside it.

## Task 3: The Budget export document — done

New pure `src/lib/finances/budget/export.ts` — the document model, `gridExportSection`,
`budgetExportDocument`, `serializeBudgetExport` — reusing `exportableColumns`,
`exportCellText`, `tableToCsv`, `tableToRecords`, `tableToMarkdown`. Tests beside it.

## Task 4: Wire BudgetView, delete the scopes — done

`exportCommands={false}` on the three grids; register `gridExportCommands` / `gridCopyCommands`
from `BudgetView` against a snapshot ref. Delete `gridScopes.ts`, its test, and the
`commandScope` / `exportFocused` props on `DataGrid`.

## Task 5: Verify and freeze — done

3564 unit tests, typecheck and lint green; `npm run smoke` rendered all 61 routes; the
acceptance list walked in the browser on `/finances/budget` and `/finances/register`.

## Follow-ups (new work — not amendments to this frozen spec)

- Nothing on the Budget page reads a Markdown export back. Import of any format is still out
  (`2026-08-14-1021` D9).
- The Backlog line and the Movement log remain outside the document (D3). If a month's audit
  trail is ever wanted in an export, that is a new decision, not a gap in this one.
