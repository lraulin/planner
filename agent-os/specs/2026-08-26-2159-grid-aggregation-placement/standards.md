# Standards for Grid aggregation placement

Applied as of standards commit `b8ecaf5a8f68b7e19b0b943e3ec4c693f042832c`.
References, not copies — see AGENTS.md. `git show <sha>:agent-os/standards/<path>` recovers
exactly what applied at shape time.

- `agent-os/standards/components/data-grid.md` — the governing standard for everything here:
  group headers, their counts, the column model, and the "what we deliberately do not do"
  list. **This spec amends it** (Task 7), so the pinned commit above is the text this work
  started from, not the text it leaves behind.
- `agent-os/standards/components/responsive.md` — below `md` the grid becomes a list and there
  are no columns to align a total to; the compact group header keeps a labelled inline run
  rather than losing its figures or showing them naked.
- `agent-os/standards/components/ux-principles.md` — the grid+drawer philosophy the data-grid
  standard is built on, including where a derived value may and may not be edited. Group
  totals are derived and read-only.
- `agent-os/standards/development/testing.md` — the shape of the work: the one piece of real
  reasoning (which track the label spans, which columns get a total) goes in `src/lib/grid/`
  with a test beside it; no React component tests; a test earns its place only if it would
  fail on a plausible mistake.
- `agent-os/standards/development/clean-code.md` — "one shared implementation per concern"
  is why `groupSummary` is replaced rather than kept alongside `groupTotals`, and
  "when the model is wrong, change the model" is why the fix is per-column cells in the shared
  grid rather than another per-view workaround.

## Deviations

**The standard is wrong today and this spec corrects it rather than deviating from it.**
`components/data-grid.md:588` lists "Aggregation footers" under what we deliberately do not do,
while Budget and Supplies have shipped group totals and footers since August. The entry's
argument is sound for the tree tabs it was written about — effort and % complete already roll up
the tree in `derive.ts`, so a group-shaped sum of the same field in the same column would be a
second, different number — and it is narrowed to say that, not deleted. Task 7 adds the
`## Aggregation` section the shipped money grids should have had.

**No deviations otherwise.** One thing worth flagging as a known gap rather than a deviation:
the standard says nothing about numeric columns or money formatting, and there is no
finance-display standard anywhere. Totals therefore align via the existing `ColumnDef.align`
and format via each view's own `formatUsd` call, exactly as the leaf cells do. Consolidating the
three near-identical `Amount` components (`financeColumns.tsx:74-90`, `statementColumns.tsx:38-46`,
and Budget's) is real, is not this spec's job, and is listed as a follow-up.
