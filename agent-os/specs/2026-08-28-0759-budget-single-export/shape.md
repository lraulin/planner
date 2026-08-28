# One Budget export — Shaping notes

**Status: frozen / complete** (2026-08-28)

## Scope

Collapse the Budget page's three per-grid exports into one document covering the whole page,
in four encodings: CSV, JSON, YAML, Markdown.

### Out of scope

- Import of any of these files. Still no round trip (`2026-08-14-1021` D9 stands).
- The Backlog line and the Movement log. Asked and declined — see `plan.md` D3.
- The right-hand inspector, the drawers, and the Review list. They are tools for changing the
  budget, not the budget.
- A whole-page export on any other module. Budget is the only page with more than one grid.
- Any change to what a cell says. Same `compactText`, same dropped columns.

## Decisions

Recorded in full in `plan.md` as D1–D9. In brief: one export for the whole page (D1), the
per-table exports deleted along with the scoping machinery they needed (D2), Markdown added to
the shared list rather than a Budget-only one (D4), CSV stacks sections while JSON/YAML become
a single keyed object (D5, D6), and rows carry a depth so the existing forest parse does the
nesting (D7).

## Why the obvious alternatives lose

- **Keep the three exports, just rename them.** The scoping was never the problem; it was a
  symptom. Three exports of a page whose whole point is that Income, Spending and Savings sum
  to one figure will always produce three files that do not.
- **One flat CSV with a leading `Section` column.** Machine-parseable, and it puts
  `Ready to Assign` and a forecast bucket into columns named `Assigned` / `Available` where
  they mean nothing. Considered and rejected with the user; stacked sections won.
- **A Budget-only `BUDGET_EXPORT_FORMATS` with a fourth member.** Two format lists that must
  stay in step, where one is the other plus Markdown. `gridExportFormatOf`, `FORMAT_LABEL`,
  `FORMAT_MIME` and both command builders all derive from the list, so the fork would have to
  be maintained in five places to avoid giving other grids a format that costs ~25 lines.
- **A second nesting/quoting implementation for the document.** The section table is a table;
  `tableToCsv`, `tableToRecords` and `parseDepthForest` already do this correctly, including
  the orphan-depth case after a filter. Adapting `section.columns` into `ExportColumn` is four
  lines and buys all of it.

## The shape of the answer

A **document of sections**, where a section is a title, a caption, column headers, and
depth-carrying string rows. Everything on the page — a `dl` of terms, a chip list of income, a
`DataGrid`, an HTML table of forecasts — flattens into that one shape, and then four
serializers each render the same document their own way. The grids are not a special case;
they are the sections whose cells come from `exportCellText` instead of a `formatUsd` call.

## Context

- **Visuals:** None. The menu is unchanged apart from losing the scoped rows and gaining
  Markdown.
- **References:** See `references.md`.
- **Product alignment:** Achieve's `File ▸ Export to Excel…` dumped the current view; the
  Budget's "current view" is a page, not a table.
