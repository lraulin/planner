# Outline Payload Packing — Shaping Notes

**Status: active**

## Scope

Reduce what the Plan and Schedule pages, and the pages that borrow the outline as supporting
data, send to the browser. The target is payload — on navigation and on every inline edit —
not rendering.

Two changes, one mechanism:

1. **Tree pages** keep the whole tree in memory but receive it packed: field names once,
   empty values omitted, the same `OutlineNode` objects rebuilt in the browser.
2. **Slice pages** receive only the rows and columns their components read, packed the same
   way, from the same `loadOutline`.

### Out of scope

- Virtualizing any grid. `components/data-grid.md` gives the reason and only Register and
  Orders virtualize; the measurements here do not demand reopening it.
- Changing `loadOutline`'s SQL, `derive`, any mutation, any column, or any default view.
- Deriving in the browser (it would make rollups and L.A.P. update optimistically — a
  behaviour change).
- Other heavy payloads: Insights, Register, Payees.
- The page cache, `loading.tsx`, link prefetching.

## The evidence shaping rests on

Production, 2026-10-12, signed-in browser: ~810–875 kB RSC (~85 kB compressed) on every
Plan tab and the Schedule calendar, 160–230 ms server, 50–90 ms client, ~600 nodes.

- **A node with nothing filled in is already 1,346 bytes.** `OutlineNode` has 63 fields;
  serialising an empty task gives 1,346 bytes, of which 955 (71%) are field names and most
  of the rest is `null` / `false` / `""`. As positional values the same row is 454 bytes;
  with defaults omitted, about 250. That matches the measured 1.3–1.5 kB per node, so
  Lee's real rows carry roughly 0–150 bytes of data beyond an empty one.
  _(Computed with `JSON.stringify` on a representative row during shaping; the local
  database has only 142 nodes with almost no text, so it could not stand in for the real
  outline. Task 2 replaces this estimate with a measurement.)_
- **The drawer does not need the wide row.** `NodeDetailDrawer` calls
  `loadNodeDetailAction(nodeId)` on open (`src/components/detail/NodeDetailDrawerBody.tsx`)
  and reads only id, name and type from the row. The prompt's "the drawer could fetch a
  node's detail when opened" is already how it works, so there is nothing to move.
  _(As built: the task and project forms also read the row's rollups and child counts, and
  `isDream` picks the heading icon, so the drawer's row is a ten-column slice, `DetailNode`.
  Still nothing that needs to leave the row.)_
- **Column trimming is weak here.** `grid-column-parity` put nearly every field in every
  grid's Show Fields list, and the grid standard has filter and search reach hidden
  columns. A grid's "needed" set is close to the whole row.
- **Edits re-ship the page.** `run()` revalidates `"/"` at layout scope and Next 16 returns
  the re-rendered route in the action response. Each inline edit on a Plan tab is another
  ~810 kB. This is the part the page cache cannot remove.
- **Who carries the outline.** Sixteen routes; listed by group in `plan.md`. What each slice
  page reads:

  | Page                       | Reads                                                         |
  | -------------------------- | ------------------------------------------------------------- |
  | Metrics                    | goal id and name, for a select (`MetricDrawer`)               |
  | Time-chart editor          | visible result areas (`TimeChartAreaPanel`)                   |
  | Notes grid                 | link-picker candidates (`NoteDrawer`)                         |
  | Wishes                     | owner lookup by id; the drawer's inputs                       |
  | Schedule calendar / agenda | project rail, project names, appointment form, owning project |

## Decisions

Lee chose each of these from options, after the evidence above.

- **Tree pages: pack the rows.** Over splitting `OutlineNode` into a slim core plus
  per-type extras (~70 files, and still repeats names per row), and over packing plus
  per-grid column trimming (small extra saving, needs every grid's filters, search,
  group-by and row menus audited).
- **Slice pages: filter and project when packing, from the same `loadOutline`.** Over
  purpose-built narrow SQL (would recompute or drop `hidden`, L.A.P., `resultAreaName` —
  the drift `main-grid-tabs` rejected) and over fetching when a picker opens (a wait on
  first open, and no fit for the always-visible Schedule rail).
- **Supersession as listed** in `plan.md`: named decisions in `main-grid-tabs`,
  `grid-column-parity`, `notes-markdown-editor`.
- **Independent of the page cache.** This spec is justified by first visits and by the
  per-edit re-ship. The cache spec was not on disk when Lee answered; it landed on `master`
  minutes later as `2026-10-13-1155-immediate-navigation-and-page-cache`. Reading it changed
  nothing decided here: it classes the seven Plan pages as `cached`, says a revalidating
  action empties the cache, and lists payload size as out of scope and "its own spec".

Decisions made in shaping without a question, because they follow from the above:

- `derive` stays on the server; SQL is not narrowed.
- The codec is self-describing and exhaustive at compile time (D1.4, D1.5).
- A go/no-go gate follows the baseline (D6). The transfer is already ~85 kB compressed and
  repeated field names compress well, so bytes on the wire will fall less than raw bytes.
  The real gain is serialisation, parse and memory, and its size is not yet measured. The
  spec does not promise a tab-switch number.

## Context

- **Visuals:** None. No UI changes; the requirement is that nothing visible changes.
- **References:** see `references.md`.
- **Product alignment:** `mission.md` — "a fast, keyboard-driven" interface on Achieve's
  model. The cost grows linearly with the outline, and the outline only grows. No roadmap
  item exists for this; it follows the ✅ daily-use performance entry.

## Standards Applied

See `standards.md`.

## As built

- **Wire layout** (`src/lib/tree/wire.ts`): `{ n, c, v }` — row count, column names once,
  and one entry per column that is either dense (`[v0, v1, …]`) or sparse (`{ i, v }`, only
  rows that differ from the column's fallback), whichever is smaller by a simple
  half-the-rows rule. Dates travel as epoch milliseconds. A column whose entry type does not
  match its field's type fails the typecheck. Fallbacks are the common value, not `null`.
- **Slices** (`src/lib/tree/wireSlices.ts`): Metrics goals, Time Chart result areas, Notes
  link targets, Wish List owners, Schedule rows. One function per consumer; the rows kept and
  the columns named beside the type the consumer is checked against.
- **Entry points**: `useOutline(wire)` in `src/components/grid/useOutline.ts`; `useGridTab`
  takes the wire, so Tasks, Projects, Goals, Result Areas and the Chooser unpack in one place.
