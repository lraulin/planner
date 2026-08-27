# Grid aggregation placement

**Status: active**
Spec folder: `agent-os/specs/2026-08-26-2159-grid-aggregation-placement/`

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-04-0924-grid-control-surface/` — the frozen grid spec
  whose durable rules became `agent-os/standards/components/data-grid.md`. It directs future
  work in this area to open a delta rather than edit that folder; this is that delta.
- **Extends:** `agent-os/specs/2026-08-23-2313-one-budget/` — its SectionHeader subtotals plus
  one combined "All spending" footer are reaffirmed here, not replaced.
- **Supersedes:** `agent-os/specs/2026-08-21-1403-commitments-expected-vs-income/` — **only**
  the placement of the group-header figures introduced by D2 ("Group headers show the same
  figures for the rows under them"), which shipped as a labelled run left of the group name.
  Everything else in D2 carries forward unchanged: which period columns are totalled, that
  only active rows count, and that the figures are restated after a filter the way the count is.
- **Supersedes:** `agent-os/specs/2026-08-26-0910-supplies-worksheet/` — **only** the form of
  its grand total (a bespoke bar below the grid). Its rule that "footer totals are the sum of
  the displayed row values, so the column visibly adds up" survives and is better served by a
  column-aligned row.
- **Unrelated:** `agent-os/specs/2026-08-26-2022-split-transactions/` (frozen at `dd9037c`).
  The Register is untouched by this spec.

## Context

Group-header totals render as a run of labelled figures immediately right of the group name —
`Housing (7)  $1,240.00 assigned  $980.00 spent  $260.00 left` — instead of in the Assigned /
Spent / Left columns. That breaks the spreadsheet expectation the rest of the grid sets, and
it forces every figure to carry a word label because nothing above it says what it is.

The placement was deliberate. `src/components/grid/DataGrid.tsx:1700-1706`:

> Sit next to the count, not at the far right of the track. The header spans every column, so
> `ml-auto` parked the figures under Category — off-screen in a scrolled grid — while the
> footer they copy stays in view.

The premise is what is wrong. The header already **is** a CSS grid with the correct
`gridTemplateColumns` (`DataGrid.tsx:1679`); its single child then spans every track
(`DataGrid.tsx:1687`), so `ml-auto` could only reach the far right of the whole track rather
than the right edge of one column. Per-column cells were never tried. Once a total sits in its
own column it is off-screen exactly when its column is — which is what a spreadsheet does.

Two documentation gaps travel with it:

- `agent-os/standards/components/data-grid.md:588` still lists **Aggregation footers** under
  "What we deliberately do not do", while Budget and Supplies have shipped them since August.
- The left-placement rule exists only as that code comment. It arrived in `3adc2e7`, a delivery
  commit of the now-frozen commitments spec, and was never written back into that spec or the
  standard. This spec closes both gaps.

## Decisions

**D1 — Header-only rollups, always. No subtotal row after the children.**
Follows YNAB and Actual Budget. The group header is the only row that survives collapse, so
the total has to live there; moving it to a footer on expand makes the money column stop being
a stable vertical scan path, and leaves a collapsed group as either a total with no name or a
second header invented to hold one. This is also the answer to the "totals before the rows they
sum" objection: a group row is a folder-plus-scoreboard, not a calculated remainder, and folders
are labelled on top.

**D2 — Totals render in the columns they total.**
The one substantive change on screen. Word labels (`assigned`, `spent`, `left`, `est. …/mo`)
are dropped, because the column header already says it.

**D3 — Register is out of scope by design, not deferral. Who owns the pipeline owns the totals.**
Budget and Supplies hold every row locally and may sum what they hold. The Register is a
prepared index with a viewport: `useRegisterSource` caches a ring of blocks around the viewport,
and `preparedDisplay` (`DataGrid.tsx:611-613`) bypasses the client filter/collapse/sort pipeline
entirely. A client sum over its `gridRows` is not stale, it is undefined — the month can span
two blocks, a collapsed year omits descendants from the index, and an expanded split would sit
under a parent already counted. Register group rows stay **label + count**; `shown` / `total`
on the index remain its only aggregates. If money on a Register group is ever wanted it becomes
an `RegisterIndexEntry` field accumulated in the existing `prepareRegister` walk beside `count`
— never a client reducer, never a subtotal row.

**D4 — No per-grid footer on Budget.**
Budget already runs SectionHeader subtotals plus exactly one full-width "All spending (bills +
regular)" footer, and each surface answers a different question: row → pack → kind → can I
afford my life, with Savings deliberately excluded from the spending line. A column footer under
each of the three tables would reprint the same three numbers a fourth time in a new costume,
and a Savings footer written in the spending footer's language would get added to it in the
reader's head. Budget's change is the group rows only.

**D5 — Supplies gets the column-aligned footer row.**
One grid, one footer, and its `biweekly` / `monthly` / `yearly` columns are already
`align: "right"` and map 1:1 onto what the bespoke `<footer>` prints. That is the case where a
column-aligned total strictly beats a chip bar.

**D6 — No "Show group subtotals" toggle**, now or parked. It was advice for a generic client
grid holding every row; the grid that would have wanted it is the one D3 removes from scope.

**D7 — Tree tabs keep no aggregation.** The argument at `data-grid.md:588` is correct _for
them_: effort and % complete already roll up the tree in `derive.ts`, so a group-shaped sum in
the same column would be a second, different number with no way to tell which is which. That
entry gets narrowed to what it actually means rather than deleted.

## Acceptance criteria

- [ ] On Budget, each group header's assigned / spent / left figures sit in the Assigned,
      Spent and Available columns, right-aligned with the leaf values beneath them, with no
      word labels.
- [ ] The figures are present and identical whether the group is collapsed or expanded, and
      nothing moves on toggle.
- [ ] On Supplies, group headers carry Biweekly / Monthly / Yearly in those columns, and the
      `funded from <envelope>` prose still reads on the header beside the label.
- [ ] Supplies' grand total is a pinned row inside the grid, sharing the column template, and
      the bespoke `<footer>` is gone.
- [ ] Scrolling a grid horizontally moves each total with its own column.
- [ ] Budget's SectionHeader subtotals, "All spending" footer and BudgetSummary are unchanged;
      none of the three Budget grids grows a footer row.
- [ ] Register group rows are unchanged: label + count, no money, no footer.
- [ ] Every grid that passes no totals renders exactly the header it renders today.
- [ ] Group totals restate after a filter, as the count already does.
- [ ] `agent-os/standards/components/data-grid.md` has an `## Aggregation` section, and its
      "Aggregation footers" non-goal no longer contradicts shipped code.
- [ ] Below `md`, group figures still read with their labels — no naked numbers where there
      are no columns to align to.

## Changes from original plan

Material refinements during implementation (requirements, design, scope). Omit pure code polish.

| #   | Change                      | Why |
| --- | --------------------------- | --- |
|     | _(filled during implement)_ |     |

---

## Task 1: Save spec documentation

Create this folder with `plan.md`, `shape.md`, `standards.md`, `references.md`. **Done.**

## Task 2: Pure layout logic + tests

New `src/lib/grid/groupTotals.ts` with `groupTotals.test.ts` beside it. The reasoning goes here
so it is testable without a React harness — component tests are forbidden
(`agent-os/standards/development/testing.md`).

```ts
/** How a group header divides its track when it carries per-column totals. */
export function totalsLayout(
  columns: readonly ColumnMeta[],
  totals: Readonly<Record<string, unknown>> | null,
): { labelSpan: number; cells: readonly (string | null)[] };
```

- `labelSpan` runs from the gutter track through the column _before_ the first column that has
  a total, so a long group name keeps the room it has today.
- No totals, or no recognised column id → `labelSpan` covers everything and `cells` is empty:
  the existing full-span header, which is every grid but two.
- A total on the first column clamps `labelSpan` to gutter + first column.
- A total keyed to a hidden or unknown column is dropped, never rendered into the wrong track.

Tests must fail on the plausible mistakes: an off-by-one on the leading gutter track, a hidden
column shifting later totals one place left, and an empty totals record collapsing the label
cell to zero width.

## Task 3: DataGrid — per-column group header cells

`src/components/grid/DataGrid.tsx`: `GroupHeader` (1616-1714) and its call site (1112-1131).

Replace `groupSummary?: (nodes, group) => ReactNode` — two consumers, both converted in this
spec, so it goes rather than lingering alongside a second mechanism — with:

```ts
/** Column-slotted totals for the rows under a group header, keyed by column id. */
groupTotals?: (nodes: TRow[], group) => Record<string, ReactNode> | null;
/** Free text after the count, for a fact about the group that is not one of the columns. */
groupNote?: (nodes: TRow[], group) => ReactNode;
```

The split exists because Supplies' summary mixes numbers with prose (`funded from <envelope> ·
budgeted $X`, `SuppliesView.tsx:340-348`), which has no column to sit in.

Desktop rendering: keep `gridTemplateColumns: gridTemplate`; emit a label cell spanning
`labelSpan` (chevron, depth indent, label, count, note), then one cell per remaining column with
`alignClass(column.align)` — the same helper `DataRow` uses at `DataGrid.tsx:1415-1423`, so
totals line up under the values they total by construction. Columns with no entry render empty;
do not invent an em dash.

Replace the comment at 1700-1706 with why per-column cells are now correct, so `ml-auto` is not
retried. Sticky/nesting styles (1668-1683) and the drag bindings are untouched.

Compact (phone): no columns exist to align to, so keep the inline run — but build it from the
same totals record plus each column's label so no figure is naked.
`agent-os/standards/components/responsive.md` governs.

Accessibility: label cell `role="rowheader"`, total cells `role="gridcell"`; the `aria-expanded`
accessible name must still carry label and count.

## Task 4: DataGrid — pinned column-aligned footer row

Same file. `footerTotals?: (rows: TRow[]) => Record<string, ReactNode> | null`.

Rendered outside the virtualizer, sticky to the bottom of the scroll container, sharing
`gridTemplate` so it scrolls horizontally with the columns. First cell is a `role="rowheader"`
reading `Total (N rows)`, where N is the filtered count the grid already tracks for
"Showing N of M" (`onCountsChange` / `preparedCounts`) — so the label cannot disagree with the
chip bar. Heavier than a group header; `tabular`; reuses `alignClass`.

Grids passing nothing are unaffected, which is every grid except Supplies.

## Task 5: Budget — totals into the columns

`src/components/finances/budget/BudgetView.tsx`. `groupTotals` (688-701) is wired at 916, 962
and 1030. Return a record instead of a labelled string, keyed to the existing column ids from
`budgetColumns.tsx:82-125` (`assigned`, `activity`, `balance` — all already `align: "right"`):

```tsx
{ assigned: <Money cents={group.assignedCents} />,
  activity: <Money cents={group.activityCents} />,
  balance:  <Money cents={group.balanceCents} /> }
```

`budgetTotals` (`src/lib/finances/budget/rows.ts:51-60`) is unchanged — the arithmetic is right,
only its presentation moves. Unchanged deliberately per D4: `SectionHeader` (1351-1379), the
"All spending" footer (968-983), `BudgetSummary`, and no `footerTotals` on any of the three grids.

## Task 6: Supplies — totals into the columns, footer into the grid

`src/components/finances/supplies/SuppliesView.tsx`.

- `groupSummary` (327-350) splits: `groupTotals` returns `{ biweekly, monthly, yearly }` keyed to
  the columns at `suppliesColumns.tsx:391-432`; `groupNote` keeps `funded from <envelope> …`.
  The `est.` / `/mo` / `/yr` labels go — the column headers say Biweekly, Monthly, Yearly.
- Delete the bespoke `<footer>` (363-377); pass `footerTotals` from the existing
  `supplyGrandTotals`. `src/lib/finances/supplies/rows.ts:114-119` already promises the footer is
  the sum of displayed values; column alignment makes that visible.

## Task 7: Update the data-grid standard

`agent-os/standards/components/data-grid.md`. New `## Aggregation` section after `## Grouping`
(76-92) recording D1–D7 as rules: totals in the columns they total and never beside the label
(with the failed `ml-auto` attempt noted so it is not retried); the header carries the rollup
collapsed and expanded, with no subtotal row after the children and why; aggregates follow the
filtered set exactly as the count must (:21-23); **who owns the pipeline owns the totals**, with
the Register named as the exemplar of the windowed case; and when a grand total is a footer row
in the grid versus a page-level bar.

Rewrite the `Aggregation footers` row at :588 to say what it means — no group-shaped sums on the
**tree tabs**, because `derive.ts` already rolls those numbers up the tree — cross-referencing
the new section for the money grids. Note `ColumnDef.align` as what a total cell aligns to, and
add `src/lib/grid/groupTotals.ts` to the file map (627-629).

No `index.yml` rebuild — no standard added, removed or renamed.

## Task 8: Verify, freeze spec, update roadmap

- `npm run lint`, `npm run typecheck`, `npm run test:unit` (check for the Postgres skip warning),
  `npm run build`.
- Start the dev server and run `npm run smoke`. Budget and Supplies are `src/app/**` routes and a
  green gate is not proof they render.
- Browser check via `/run-planner`, desktop and below `md`: Budget group totals under Assigned /
  Spent / Available, unchanged on collapse, SectionHeaders and All spending untouched, long group
  names not clipped worse than today; Supplies group totals under their period columns with the
  `funded from` prose intact and the footer row pinned and aligned; horizontal scroll keeps each
  total with its column; one untouched grid (Outline or Tasks) still full-span label + count;
  Register unchanged.
- Update `agent-os/product/roadmap.md:866-869`, which records the shipped behaviour as
  "active-only totals in grid footers and group headers".
- Confirm acceptance criteria, complete **Changes from original plan**, mark this folder
  **Status: frozen / complete** with the date, and move any leftovers to **Follow-ups**.

---

> **Standing rule while this spec is active:** when a material change lands on requirements,
> design or scope — including feedback on what was actually built — update the relevant sections
> above and append a row to **Changes from original plan**. Skip pure implementation details.
> Freeze when verified.
