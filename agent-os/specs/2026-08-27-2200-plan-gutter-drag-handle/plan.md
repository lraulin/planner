# Restore row drag: a grab-bar gutter for the Plan module, and live drag ids

**Status: frozen / complete** (2026-08-27)
Spec folder: `agent-os/specs/2026-08-27-2200-plan-gutter-drag-handle/`
Standards pinned at: `91b94c63894ceb565c206327847af2185a9b194d`

## Spec relationships

- **Supersedes:** `agent-os/specs/2026-08-25-0922-grid-checkboxes-bulk-category/` — the
  decision "**Checkbox gutter on every DataGrid**, including Outline and the three budget
  tables." The gutter is also the HTML5 drag source; a control in it leaves no grabbable
  track. Grids that offer row drag, and every Plan-module grid, now take a plain grab bar
  instead. Everything else that spec decided stands: header select-all where the checkbox
  remains, `⌘A` as an Item command, bulk Category, catalog `Delete (N)`, Outline
  **Move to…**.
- **Corrects:** commit `90d91ec` "Pass DataGrid row handlers by identity so memo can skip
  rows" (no spec — it landed as a performance fix). Its row-props stabilisation is kept; only
  its latent consequence for the drag bindings is fixed. See **Root cause 1**.
- **Extends:** `agent-os/specs/2026-07-27-1100-scaffold-and-outline-tab/` — the 2026-07-28
  drag-to-reorder change block. Drop resolution (`lib/tree/dnd.ts`), the handle-owns-
  dragstart rule, and `rowDrag` as an opt-in prop are unchanged.
- **Extends:** `agent-os/specs/2026-08-19-0912-always-ranked-priorities/` — sibling priority
  renumber on drop, and `moveNode`'s `priorityPlacement`, unchanged. Its "drag is off below
  `md`; the command is the only path there" still holds.
- **Extends:** `agent-os/specs/2026-07-30-2040-tc-priority/` — Chooser drag stays gated on
  `rankByTcPriority` and an unsorted view.
- **Extends:** `agent-os/specs/2026-08-04-0924-grid-control-surface/` — "Drag-to-reorder is
  a first-class capability, not a fallback." This spec is that rule being enforced.

## Context

Drag-to-prioritise and drag-to-nest were dead in the Plan module and the Task Chooser. Two
independent causes, landing a day apart, both from the 2026-08-24/25 performance-and-
checkbox work.

### Root cause 1 — the drop target held a stale drag binding (the real break)

`dragBindingFor` captured `dragIds` in a closure, and `DataRow`'s memo comparator
(`dragBindingEqual`) deliberately compares only `dragging` and `hint`:

> Drag bindings rebuild every render; only dragging/hint state should bust the row memo.

While that was true, the rows the pointer travels over never re-render during a drag, so
their `onDragOver` kept the binding built before `dragstart` — one whose `activeDrag` is
still `null`. `onOver` returns `false` on the first line, the drop line never appears, and
`drop` never fires. **Nothing could be dropped anywhere.**

This was harmless until `90d91ec` ("Pass DataGrid row handlers by identity so memo can skip
rows", 2026-08-24) made the row props stable enough for the memo to actually skip. Before
it, a fresh per-row handler on every render re-rendered every row and quietly refreshed the
bindings. That commit's own message anticipated a memo hazard — "the plausible mistake is a
per-row lambda in the map" — and this is the opposite one: the lambda that _should_ have
been rebuilt no longer was. Verified in the browser: `dragstart` fired and set state, the
source row got its `opacity-40`, and the target row's React fiber `memoizedProps` was
byte-identical before and after, `onDragOver` included.

### Root cause 2 — the checkbox ate the grab bar

`2b55133` put a 14px `SelectionCheckbox` in the centre of the 28px gutter on every
DataGrid. A form control does not hand a press to its `draggable` ancestor, and
`SelectionCheckbox` also stops `mousedown` propagation while `RowHandle` bailed out of
`onHandleMouseDown` for any target inside an `input`. What was left of the drag source was
~6px on each side of the box. The same commit deleted `RowHandle`'s `onClick` while the row
body still returns early on `[data-row-handle]`, so that sliver did not even select — the
gutter read as gone.

The frozen spec meant them to coexist ("drag still starts from the handle area — do not make
checkbox mousedown start a drag"); it just left no handle area.

## Decisions

- **Two gutter modes, chosen explicitly per grid** — `gutter: "checkbox" | "handle"`,
  default `"checkbox"`. Not derived from `rowDrag`: Chooser and Day turn `rowDrag` off under
  a sort, and chrome that changes when you sort a column is worse than either mode.
- **`handle` mode is empty on purpose.** No glyph, no box. The whole 1.75rem track is the
  drag source, and a click on it selects with Shift-range / ⌘-toggle — the behaviour
  `2b55133` removed.
- **The whole Plan module takes `handle`**, not only the tabs that drag today: Outline,
  Tasks, Projects, Goals, Result Areas, Wish List, plus the Task Chooser. One chrome across
  the module. Select-all is no loss there — `⌘A` is a registered Item command and stays.
- **Notes and Day take `handle` too.** They are outside the Plan module but pass `rowDrag`,
  so the checkbox broke them the same way.
- **Goals and Result Areas gain the drag they should have had.** Goals nest under result
  areas and under each other exactly as projects do; sub-areas are the one nesting the
  Result Areas tab expresses. Both are `useGridTab` hosts over `OutlineNode`, so they take
  the same `useTreeRowDrag` as Tasks and Projects — no new tree logic. **Wish List does
  not**: it builds grouped `WishListRow`s, not a tree. It takes the plain gutter only.
- **Everything else keeps the checkbox** — Register, the three Budget tables, Payees,
  Accounts, Statements, Supplies, Contacts, Resources, Agenda, Time Charts, Metrics,
  Timeline, Jobs, Residences, Amazon, Find — with the header tri-state select-all intact.
- **Checkbox mode's gutter track now selects too.** A click beside the box was dead from
  `2b55133` until now; `SelectionCheckbox` already stops its own click, so there is no
  double-fire.
- **Compact is untouched.** Drag is off below `md` by design, so `CompactRow`'s checkbox and
  the compact "Select all" bar were never part of this. Every host keeps passing
  `selectAllState` / `onToggleSelectAll`; `gutter` is read only on the desktop path.
- **Achieve alignment:** Achieve's outline had neither checkboxes nor row numbers in the
  gutter. `2b55133` named its checkbox a deliberate divergence; the Plan module returns to
  Achieve's chrome. The catalogs, which are beyond Achieve, keep theirs.

### Out of scope

- Multi-select drag (still deferred, as in every prior spec).
- Chooser / Day / Notes drag gates (`rankByTcPriority`, active sort, nested + manual order).
  Those are intentional and unchanged.
- Wish List drag.
- Virtualization, and any wider revisit of the `DataRow` memo.

## Acceptance criteria

- [x] Every Plan-module grid and the Task Chooser show an empty grab-bar gutter; clicking it
      selects, Shift-click extends a range, ⌘-click toggles.
      Verified in the browser on `/plan/outline`: 1 / 5 / 4 rows selected across the three.
- [x] `[data-row-handle]` in `handle` mode is `draggable`, 28px wide, and contains no
      `input`. Verified on Outline, Tasks, Projects, Goals, Result Areas, Notes.
- [x] A drag reorders and renumbers priority. Verified on `/plan/outline`: "Drop off at
      Fedex" dragged to the top third of its first sibling became **A1** and pushed the rest
      to A2/A3/A4.
- [x] A drag onto a row's middle third nests. Verified on `/plan/outline`: the dragged task
      went from `aria-level` 2 to 3 under the drop target, and Shift+Tab outdented it back.
- [x] `dragover` is accepted (the event is cancelled) on a row that has not re-rendered
      since `dragstart` — the Root cause 1 regression. Verified on Outline, Tasks, Projects,
      Goals, Result Areas, Notes for both the reorder and the nest zone.
- [x] Goals and Result Areas accept both drop zones where they previously offered no drag
      at all.
- [x] Finances keeps the checkbox gutter and the header select-all, and the tri-state still
      cycles. Verified on `/finances/budget`: track-click selected 1, box-click added a
      second, header select-all took the table to 4, and unchecking cleared it to 0
      (`allowEmpty`).
- [x] lint, typecheck, 944 tests across 57 files (unit **and** Postgres integration, no skip
      warning), `next build`, `npm run smoke` (61 routes).
- [ ] Phone viewport not re-checked in a browser — the extension would not resize the
      window. Argued from the code path instead: `gutter` is read only inside the desktop
      header's `leadingGutter` and `DataRow`/`RowHandle`; `CompactRow` and the compact
      "Select all" bar are untouched and every host still passes `onToggleSelectAll`.

## Changes from original plan

| #   | Change                                                                                      | Why                                                                                                                                                                                                                                                              |
| --- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Root cause 1 was not in the plan.** The plan named only the checkbox crowding the gutter. | Widening the grab area alone would have shipped a gutter that felt right and still dropped nothing. Found by driving real `DragEvent`s at the page: `dragstart` worked, `dragover` was refused, and the target row's fiber props were unchanged across the drag. |
| 2   | Chooser, Day and Notes drag could not be exercised in their default views.                  | All three gate `rowDrag` on host state (`rankByTcPriority`, no active sort, nested + manual order) — pre-existing and intentional. Notes was driven end-to-end after switching it to nested + manual; Chooser and Day were left on their gates.                  |
