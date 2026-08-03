# Task Chooser — Shaping Notes

**Status: frozen / complete** (2026-07-30)
Authoritative as-built detail: `plan.md` (including **Changes from original plan**).

## Scope

Achieve Planner's **Task Chooser** tab (user manual §8): a cross-project list of leaf tasks
and task-less projects, ranked by a numeric score, with per-view scoring settings and a date
filter. It answers _"what is the best use of my time right now?"_ without scanning the
Outline.

### In scope

- `/chooser` route + **Task Chooser** entry in the tab strip
- Score-ordered grid with `#` (rank) and **Score** columns beside the usual
  State / Pri / Name / Effort Left / Deadline / Status
- Five views: **Best Overall**, **Next Action Only**, **To-do List**, **Urgent**,
  **Deadlines** — each with its own weights, each remembering them separately
- Date filter: None / Current / Overdue / Behind Schedule / Due Soon / Next 7 / 14 / 30
  Days / Group By Deadline
- **Show More** / **Show Less** with an `N of M` label
- **Settings…** modal over the current view's weights, with Reset
- `Advanced Filters` checkbox → the grid's column filter dropdowns
- `Project:` breadcrumb line showing the selected row's ancestor path
- Row parity with the other list tabs: Enter / double-click opens the drawer, F2 renames,
  inline cell edits

### Out of scope

- **Best in Project Block** view — needs project blocks read off the weekly calendar
- **Best work-related** / **Best personal** views — need a dependable Work/Personal
  convention on result-area `category`, which does not exist yet
- The **Parents** pane from the screenshot (ancestor tree below the grid)
- Task **predecessors**, and therefore Achieve's "advanced" Next Action definition
- Server-side / cross-device settings persistence
- Achieve's Views/Filters sidebar and custom filter builder (already out per
  `2026-07-28-1121-main-grid-tabs`)

## Decisions

- **Define the formula, and show it.** The manual names the factors — weighted priority
  including ancestors, deadline proximity, target start/end proximity, a Focus bonus, and
  result-area importance — but never publishes the arithmetic. We define an additive score
  in a pure module and render it in a **Score** column, so the ordering is inspectable
  rather than magic. This is what makes the Settings dialog meaningful: every band is a
  named weight the user can move.

  As built, three optional columns extend that: `L.A.P.`, `Fo`, and `Due (incl. parents)`.
  The Score says how much; those say why. See change 3 in `plan.md`.

- **Focus nudges, it does not repriorititse.** The default `focusBonus` sits _below_ one
  priority letter step, so focusing an item reorders it among its peers without promoting
  it past a whole letter. Raising it past the letter step is a supported choice, not the
  default. See change 1 in `plan.md`.

- **Score off L.A.P., not raw priority.** `derive()` already computes each node's inherited
  priority. Using it is what produces the manual's rule that _"sub-item priority ranks are
  relative to the parent"_ — reprioritising a project moves all of its tasks.

- **Five views, not eight.** The three dropped views rest on machinery that either doesn't
  exist (project blocks in the chooser's reach) or on a soft convention (a result area
  being "Work"). Shipping them as guesses would bake in an assumption the user hasn't made
  yet. They are follow-up work.

- **Settings in `localStorage`.** Same trade `useGridColumns` already accepts for column
  layout: no migration, no server action, no integration test — at the cost of not
  following you to another device. Scoring weights are display tuning, not data.

- **Breadcrumb line, no Parents pane.** The single `Project: <path>` line answers "what is
  this part of" at almost no cost, since ancestor walking already exists. The resizable
  tree pane is parity for its own sake.

- **No schema change.** Every input already exists. The one read-path gap is
  `result_area_details.importance`, which `loadOutline` doesn't currently select.

- **Date filters never touch the score.** The manual is explicit: _"The date filter only
  affects which tasks are displayed … but does not affect the scoring."_ Enforced by a test,
  not by care.

## Context

- **Visuals:** `visuals/task-chooser.png` (from `screenshots/TaskChooserSS.png`) — the
  Achieve Task Chooser tab, showing the selection bar, the ranked grid, and the Parents pane
  we are not building.
- **Manual:** `docs/achieve-planner/user-manual.md` §8 (§8.1 window, §8.1.1 views, §8.1.2 Show More/Less,
  §8.1.3 date filters, §8.2 settings, §8.3 next actions), plus §3.10 on the Focus field.
- **References:** see `references.md` — chiefly `TasksGrid`, `useGridTab`, `sliceTree`,
  `derive`, `scheduleStatus`, and `useGridColumns`.
- **Product alignment:** `roadmap.md` names Task Chooser in both Phase 1 ("light polish on
  the main grids … Life Plan / Task Chooser only if still wanted") and Phase 2 ("Task
  Chooser and any remaining Achieve chrome that earns its keep"). This closes both.

## Standards Applied

- **components/ux-principles** — grid + drawer is the default; grid-visible fields edit
  inline; keyboard first. The chooser is a view onto the tree, so it reuses the shared grid
  rather than growing a second one.
- **components/modal-pattern** — the Settings dialog is a short-lived configuration step,
  the one class of modal the principles allow. Built on `ModalShell`.
- **development/testing** — all the reasoning lives in `src/lib/chooser/**` with unit tests
  beside it; no React component tests; no database writes, so no integration test.
