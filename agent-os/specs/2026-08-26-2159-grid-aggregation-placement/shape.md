# Grid aggregation placement — Shaping Notes

**Status: frozen / complete** — 2026-08-26

## Scope

Move group-header totals out of the run of labelled figures beside the group name and into the
columns they total, and give the grid a real column-aligned grand-total row for the one page
that needs one. Then write the resulting rules into
`agent-os/standards/components/data-grid.md`, which currently says we do not do aggregation at
all — and say there which grid gets which treatment, because not every grid does the same job.

Touched: the shared `DataGrid`, Budget (three grids), Supplies (one grid), the data-grid
standard, one roadmap line.

### Out of scope

- **Register aggregation of any kind.** See "The Register is not a generic grid" below.
- A "Show group subtotals" preference, or any group-footer / subtotal row.
- Per-grid footers on Budget.
- Aggregation on the tree tabs (Outline, Tasks, Projects, Goals, Result Areas), Statements,
  Accounts, Payees, Amazon orders, Notes — all of which have grouping and none of which has
  asked for a sum.
- A frozen/sticky first column during horizontal scroll. Worth wanting once totals live in
  far-right columns, but it is a change to every grid and belongs in its own spec.
- A user-selectable aggregation function per column. No `aggFn` notion exists in `ColumnDef`
  and nothing here needs one — on money columns, offering `avg` is how people come to believe
  a wrong number.

## Decisions

The full statements are D1–D7 in `plan.md`. What is worth recording here is _why_ the two
obvious-looking options were rejected.

### Why not a subtotal row after the children

The spreadsheet instinct — items, then subtotal, then the next group — is answering a different
question than a budget page asks. It matches printed worksheets, where groups never collapse.
The moment collapse exists, the label and the total must occupy one surviving row, and if that
row is at the bottom then a collapsed group is either a total with no name or a second header
invented to hold the name.

The variant we nearly shipped (totals on the header when collapsed, in a footer when expanded)
is worse than either end: people budget by glancing down the Available column, and a figure that
lives in a different vertical slot depending on expand state stops that column being a scan
path. AG Grid has a flag for exactly this failure. YNAB and Actual both keep totals on the group
header in both states, and both were doing this deliberately, not because they forgot how
spreadsheets work — in Actual the group row is a full-width row in the same grid, same
Budgeted / Spent / Balance columns, just heavier type and a quieter fill.

What actually made the current design feel wrong is not that the total precedes the rows. It is
that the total is nowhere near its column. Fix the placement and the ordering objection goes
with it.

### The Register is not a generic grid

This was the substantive discovery of shaping, and it changed the scope more than anything else.

The advice we started from — header always, group footer on demand, pinned grand total — is
sound for a generic client grid that holds every row. The Register does not. It is a prepared
index with a viewport: the server owns the pipeline, the browser owns a window and a chevron,
and `preparedDisplay` is the declaration of that split. Thousands of rows are why the page has
its own virtualization path at all.

So a client sum over Register rows is not approximately right, it is undefined — the cache is a
prefetch ring around the viewport, not a sample of the group. A subtotal row after the last
loaded child is a lie the moment a month spans two blocks. Virtualization does not help: it
draws rows, it does not know the rows that were never sent.

The general rule that falls out, and the one worth carrying into the standard:

> **Who owns the pipeline owns the totals.** If a number has to be true for a group the user has
> not fully loaded, it is an index field. If it only has to be true for the pixels on screen, it
> does not belong on that grid.

Consistency is not "every group row shows a sum". Forcing one rule onto both grids is how you
get a generic aggregator that reduces over `gridRows` and double-counts an expanded split.
Register group rows stay label + count, which is already the right design; money there would be
decoration. If it is ever genuinely wanted — "collapsed 2023 = −$41k" as a product question — it
is an `RegisterIndexEntry` field accumulated in the walk `prepareRegister` already performs, at
the cost of arithmetic on rows it is already touching, with no extra query and no larger block.

### Why Budget gets no footer row

Budget has four totals surfaces already and each answers a different question: the row (what is
this one thing doing), the group header (this pack versus that pack), the SectionHeader (the
whole kind — Regular, Bills, Savings), and the single All spending footer (operating cost this
month, Regular + Bills, savings held out so a house fund cannot masquerade as overspend).
BudgetSummary answers a fifth (is every dollar assigned). Adding a column footer under each of
the three tables prints Assigned / Spent / Left a fourth time in a new costume, and leaves the
reader unsure which line is the argument.

The exclusion of Savings from the spending line is the product, so a Savings grid footer written
in the same visual language as the spending footer is actively harmful — it will get added in
someone's head.

Column alignment is the only real argument for a grid footer, and on Budget it is weak: the
SectionHeader chip is three inches below a group chip in the same three units, under an
`autoHeight` table of eight rows. Putting the _group_ totals in the columns — which this spec
does — is what keeps the eye in the columns for pack-versus-pack. That is the fix; a fourth
footer is not.

Supplies is the opposite case and gets the footer: one grid, one footer, and its Biweekly /
Monthly / Yearly columns are exactly what the bar reprints.

## Context

- **Visuals:** None. Options were compared as ASCII mockups during shaping.
- **References:** See `references.md`.
- **Product alignment:** `agent-os/product/roadmap.md:866-869` records the shipped commitments
  work as "active-only totals in grid footers and group headers"; this changes where those
  totals sit, not what they say, and the line needs a light edit at freeze. No roadmap item
  asks for grid aggregation as unbuilt work, and none asks for Register totals.

## Standards applied

- `components/data-grid.md` — the governing standard, and the one this spec amends.
- `components/responsive.md` — below `md` there are no columns to align to, so the compact
  header keeps a labelled inline run.
- `components/ux-principles.md` — the grid+drawer reading the data-grid standard sits on.
- `development/testing.md` — the layout decision goes in `src/lib/grid/`, not the component;
  no React component tests.
- `development/clean-code.md` — `groupSummary` is replaced rather than joined by a second
  mechanism; one shared implementation per concern.

Paths and rationale only, per AGENTS.md. See `standards.md` for the pinned commit.
