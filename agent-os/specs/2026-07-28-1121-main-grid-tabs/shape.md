# Main Grid Tabs — Shaping Notes

## Scope

Achieve's four list tabs, at parity with the screenshots in `screenshots/main tabs/`:

- **Projects** — Result Area scope, Groups / Goals / Deferred toggles, six View presets
- **Tasks** — Project scope, Group by Area / Deferred / Project's Purpose toggles
- **Goals** — Result Area scope, All / Active / Completed views
- **Wish List** — Result Area scope, the four wish quadrants across every area

Plus the machinery all four share, which does not exist yet: a column-definition
abstraction, per-column filter dropdowns with Achieve's semantic presets, a Show Fields
column chooser, group header rows, and a derived schedule status.

This is the fourth Phase 1 item in `agent-os/product/roadmap.md`. The roadmap files the
Wish List under Phase 2, but it is the cheapest of the four — the data already exists and
the columns are four — so it ships alongside the others rather than waiting.

### Out of scope

- **User-created and saved Views.** The named Views ship as built-in, non-editable presets.
  Column show/hide and reorder are live, persisted to `localStorage`.
- **Achieve's custom filter builder** — the `(Custom)` entry in each filter dropdown.
- **The Views/Filters sidebar** down the left edge of Achieve's window.
- **Active Project Recurrence and Active Project Printing views** — recurrence has no model
  in the schema and printing is not a thing we do.
- **Drag-to-reorder**, still outstanding from the outline spec.
- **The Life Plan and Task Chooser tabs**, both visible in the screenshots' tab strip.

## Decisions

- **Four separate tabs, not one grid with a type filter.** The tempting simplification —
  everything is a filtered slice of one tree — breaks on the columns: Goals shows
  Title/Definition/Range, and Wish List reads `node_items` rather than `nodes` at all.
  Column customization should also be remembered per type, which a single shared grid state
  cannot express. Rejected: a single `/items?type=project` route.

- **Hand-rolled shared grid; no grid library.** The repo has five runtime dependencies and
  no UI library at all, and the hard half of a data grid is already solved: `loadOutline`
  flattens the tree in one recursive CTE, `derive.ts` computes rollups and L.A.P., collapse
  is persisted server-side, and every cell editor already exists in `OutlineRow.tsx`.
  - Rejected **MUI X DataGrid** and **AG Grid Community** on licensing — tree data, row
    grouping and set filters are Pro/Premium/Enterprise in both. Precisely the features
    needed here.
  - Rejected **TanStack Table** (MIT, headless, genuinely capable) because what it supplies
    — sorting, filter state, column order/visibility state — is the easy half, while the
    cells, the Show Fields dialog and the semantic filter presets stay hand-written either
    way; and its row model would have to be reconciled with server-persisted collapse and
    the existing optimistic patch layer. It remains the right answer if the hand-rolled
    grid starts accumulating table logic rather than app logic.

- **The outline migrates onto the shared grid rather than gaining a sibling.** Two grids
  would fork `PriorityCell`, `EffortCell` and `DeadlineCell` and drift within a month.
  `ux-principles.md` requires "the same patterns across every view". Lee's instruction was
  explicit: no sunk-cost — the outline becomes the shared grid with the outline's columns
  and grouping off.

- **One widened `loadOutline`, not a per-tab query.** The Target Start, Definition and
  Range columns need `project_details` and `goal_details`; adding two LEFT JOINs keeps one
  tree query, one `derive`, one `OutlineNode`, and lets every tab inherit rollups and
  L.A.P. for free. This reverses the outline spec's "the outline query does not grow", on
  the grounds that there are now four consumers rather than one. Rejected: narrow per-tab
  queries, which would each need their own rollup pass.

- **Schedule Status is derived, never stored.** A pure function beside `derive.ts`, keyed
  off the deadline alone. Lee's definition: On Schedule / Due Soon (≤ 5 days) / Close to
  Deadline (≤ 2 days) / Due Tomorrow / Due Today / Overdue.

- **State and Status are two different columns that Achieve labels confusingly.** `State`
  is the stored `nodes.state`, rendered on the grid tabs as Achieve's two-letter code — NS,
  IP, W, C, Cn, P, D, SD, PR — and editable via dropdown. `Status` on the Projects and
  Tasks tabs is the derived schedule status and read-only. `Status` on the **Goals** tab is
  `nodes.state` again, spelled out in full. The column ids keep them apart even though the
  headers do not.

- **Scope pickers are dropdowns and popovers, not Achieve's modals.** Achieve's Select
  Project dialog (screenshot 10.45.10) is a modal over the grid. `ux-principles.md` reserves
  modals for destructive confirmations, so the filter box and project tree live in a
  popover instead. The behaviour — filter box, tree, All/No Project entries — carries over.

- **Column layout persists to `localStorage`, not the database.** No schema change and no
  user-settings table for what is a per-device display preference.

## Context

- **Visuals:** `screenshots/main tabs/` — 20 captures taken 2026-07-28. Not copied into a
  `visuals/` folder here, because this spec also removes `screenshots/` from git; see
  `references.md` for what each one shows.
- **References:** the Outline tab and detail drawer, both in-repo. See `references.md`.
- **Product alignment:** Phase 1 of `roadmap.md`. `mission.md`'s "Achieve's exact workflow"
  is the governing constraint — replicate faithfully first, tune to preference afterwards.

## Standards Applied

- **`components/ux-principles.md`** — governs inline editing for grid columns, read-only
  rollups, the modal rule that turns Achieve's Select Project dialog into a popover, the
  `Enter`/`F2` bindings every view must match, and revert-and-flag on unparseable input.
- **`components/drawer-pattern.md`** — the four new tabs all open the same
  `NodeDetailDrawer`, so the open/close flow, the `{open && node && …}` guard, and the
  server-action contract apply unchanged.

## Open Questions

- Achieve's **Groups** toggle appears to control the Category and Result Area header levels
  together — screenshot 10.45.45 loses both at once. Built as one toggle; revisit if the
  tour docs say otherwise.
- What Achieve's **Status** column shows for a completed item. Assumed "Completed".
- Whether **L.A.P.** is `derive.ts`'s inherited ancestor priority. Carried over unresolved
  from `2026-07-27-1100-scaffold-and-outline-tab`.
- Whether the Projects tab's **Tasks** column (`1/1` in the screenshots) counts active tasks
  over total tasks, or direct children over descendants. Assumed active over total.
