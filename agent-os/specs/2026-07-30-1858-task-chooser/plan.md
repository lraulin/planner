# Task Chooser

**Status: frozen / complete** (2026-07-30)
Spec folder: `agent-os/specs/2026-07-30-1858-task-chooser/`

## Context

Achieve Planner's **Task Chooser** (user manual §8, `screenshots/TaskChooserSS.png`) is the
tab that answers _"what is the best use of my time right now?"_ It lists leaf tasks (and
task-less projects) across every project, sorted by a numeric score built from the item's
inherited priority, its deadline, its target dates, and its Focus flag — then filters that
list by date band and by view.

The planner has every input this needs and none of the surface. `derive()` already computes
L.A.P. (inherited priority); `nodes.focus` exists and is editable but currently affects
nothing; `scheduleStatus()` already bands deadlines. The roadmap lists Task Chooser twice —
Phase 1 "still in phase 1" polish and Phase 2 "near-term Achieve surfaces" — as the main
remaining Achieve grid tab.

Outcome: a **Task Chooser** tab at `/chooser` that ranks work by a transparent, tunable
score, so choosing the next task stops being a scan of the Outline.

## Decisions

Confirmed during shaping:

- **Transparent additive score, with a visible Score column.** The manual publishes the
  _factors_ but never the formula, so we define one — pure, unit-tested, and legible on
  screen rather than a black box.
- **Five of Achieve's eight views.** Best Overall, Next Action Only, To-do List, Urgent,
  Deadlines. Dropped: _Best in Project Block_ (needs project blocks read off the weekly
  calendar), _Best work-related_ / _Best personal_ (need a dependable Work/Personal
  convention on result-area `category`). Both are follow-up work, not amendments here.
- **Settings live in `localStorage`, keyed per view** — the same trade `useGridColumns`
  already accepts for column layout. No migration, no server action; the cost is that
  weights don't follow you to another device.
- **Breadcrumb line, no Parents pane.** The toolbar's `Project: <ancestor path>` line under
  the toolbar; the screenshot's resizable Parents tree is out.
- **No new tables, no migration.** Every input already exists. One read-path change:
  `loadOutline` doesn't currently select `result_area_details.importance`, and the score
  wants it.
- **Next Action uses the simple definition only.** There is no predecessor/dependency model
  in the schema, so Achieve's "advanced" predecessor-based definition is not available.

### Out of scope

- Best in Project Block, Best work-related, Best personal views
- The Parents pane
- Task predecessors (and therefore the advanced Next Action definition)
- Persisting settings server-side / cross-device
- Achieve's Views/Filters sidebar and custom filter builder (already out per
  `2026-07-28-1121-main-grid-tabs`)

## Acceptance criteria

All verified in the running app on 2026-07-30 (screenshots in `visuals/`).

- [x] A **Task Chooser** tab appears in `TabStrip` and `/chooser` renders a score-sorted grid
- [x] Candidates are leaf tasks + task-less projects, excluding completed/cancelled, and
      excluding `postponed` unless the Deferred toggle is on
- [x] Rows are ordered by descending score; the **Score** column shows the number, and the
      leading **#** column shows rank
- [x] View dropdown offers the five views, each with its own weights and candidate rule
- [x] **Next Action Only** shows at most one item per project, honouring both settings flags.
      Verified against the seed: 26 candidates collapse to 14, and flipping
      `Use task priority order` swaps which task the Inbox project contributes
- [x] Date dropdown offers None / Current / Overdue / Behind Schedule / Due Soon /
      Next 7 / 14 / 30 Days / Group By Deadline, filtering display only — never the score
- [x] **Show More** / **Show Less** change the visible count; the label reads `N of M`
- [x] **Settings…** opens a modal of the current view's weights, with Reset; changes persist
      per view across reloads and do not leak between views (`…settings.urgent` stays unset
      after editing `…settings.next-action`)
- [x] Selecting a row shows its full ancestor path on the `Project:` line
- [x] Enter / double-click opens the record drawer; F2 renames — parity with the other tabs
- [x] `npm run test:unit` (438 tests, 34 files, Postgres integration suites included),
      `typecheck`, `lint`, and `build` all pass

**The behaviour the feature rests on, checked live:** setting a past deadline on a
B-priority task at rank 20 (score 72) moved it to rank 1 (score 192) with status Overdue;
clearing the deadline restored the original order.

## Changes from original plan

| #   | Change                                                                                                                                                                              | Why                                                                                                                                                                                                                                                                                                                   |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Focus bonus capped below one priority letter** (15, against a `priorityLetterStep` of 20). The first draft used 40.                                                               | A test asserting "Focus is a tiebreak, not an override" failed: at 40 a focused C1 scored exactly a plain A1. That made Focus a silent reprioritisation. The weight is user-tunable, so anyone who _wants_ Focus to dominate can raise it — but the default now means what the docs say.                              |
| 2   | **`today` is `string \| null` through the whole chooser**, not `string`. A null day means every date term scores zero and every date band stands down.                              | On the server there is no "today" (`useToday()` returns null until hydration). Passing `""` would have fed `NaN` into every comparison, silently emptying date-filtered views on the server render and mismatching the client. Same contract `scheduleStatus()` already uses.                                         |
| 3   | **Added three hideable columns beyond the plan's set:** `L.A.P.` (inherited priority), `Fo` (Focus), and `Due (incl. parents)` (the effective deadline, italicised when inherited). | The Score column says _how much_; these say _why_. Without them, "an undated C task is above my A1" has no answer inside the tab. All three are off by default, so the shipped layout still matches Achieve's.                                                                                                        |
| 4   | **Rank, Score, and the effective-deadline column are not sortable or filterable.**                                                                                                  | `ColumnDef.sortValue` / `filterValue` receive only the row, not the column ctx, and those three values live in the ctx. Sorting by Score would also be a no-op — the rows arrive in score order. Not worth widening the shared `ColumnDef` signature for.                                                             |
| 5   | **Out of band: added a local-development login bypass** (`AUTH_DEV_BYPASS`, `src/lib/auth/dev-bypass.ts`). Not part of the Task Chooser.                                            | Requested mid-implementation. The browser driver starts from a cold profile every run, so every verification pass had to script a login first. Gated twice — `NODE_ENV !== "production"` (inlined at build) **and** the flag set to exactly `"true"` — with a unit test covering both gates and the near-miss values. |

---

## Task 1: Save spec documentation

Create `agent-os/specs/2026-07-30-1858-task-chooser/` with `plan.md` (this file, Status:
active), `shape.md`, `standards.md`, `references.md`, and `visuals/` holding a copy of
`screenshots/TaskChooserSS.png`.

Standards to pull into `standards.md`: `components/ux-principles`, `components/modal-pattern`
(the Settings dialog), `development/testing`.

## Task 2: Load result-area importance

`src/lib/tree/queries.ts` selects `rad.color, rad.category` but not `rad.importance`, which
the score's area-weight term needs.

- Add `rad.importance` to the `SELECT` and the row mapping in `loadOutline`
- Add `importance: number | null` to `OutlineRow` in `src/lib/tree/types.ts`

No migration — the column already exists on `result_area_details`.

## Task 3: The scoring function

New `src/lib/chooser/score.ts` + `score.test.ts`. Pure, no `new Date()`, no DB — `today`
arrives as a `YYYY-MM-DD` string exactly as `scheduleStatus()` already takes it.

```
score(item, ctx, weights) =
    priorityBase(lapLetter, lapRank)        // A1 highest … D lowest, unset lowest of all
  + deadlineBonus(daysToEffectiveDeadline)  // overdue ≫ today > tomorrow > soon > none
  + targetDateBonus(targetStart, targetEnd, today)
  + (focus ? focusBonus : 0)
  + areaImportance * importanceWeight
```

- `priorityBase` reads **L.A.P.** (`lapLetter` / `lapRank` from `derive()`), not the raw
  priority — that is what gives the manual's "sub-item ranks are relative to the parent".
- `effectiveDeadline(node, byId)` — earliest deadline at or above the node, which the date
  filters also need. Manual calls this the "ancestor deadline".
- `Weights` is a flat record of numbers with a documented default set; every band is a named
  weight so the Settings dialog is a form over this type.

Tests that would fail on a plausible mistake: a child of an A1 parent outranks a child of a
C parent when both are unset; an overdue item beats an on-schedule item one priority letter
higher; Focus is a tiebreak not an override; an ancestor's deadline is inherited when the
node has none, and the _earliest_ one wins when two ancestors have them.

## Task 4: Views, candidates, and date filters

New `src/lib/chooser/views.ts` + `views.test.ts`, plus `src/lib/chooser/types.ts`.

- `CHOOSER_VIEWS` — the five view definitions, each with `id`, `label`, default `Weights`,
  and any extra candidate rule (Deadlines keeps only items with an effective deadline;
  To-do List keeps focus / started / target-start-reached items).
- `chooserCandidates(nodes, opts)` — leaf tasks + task-less projects; drop
  completed/cancelled; drop `postponed` unless `includeDeferred`. Reuse `sliceTree`'s scope
  and ancestor walking where it fits rather than re-walking the tree.
- `applyNextActionFilter(scored, settings)` — one item per project. With
  `useTaskPriorityOrder` on, the project's topmost active leaf in `sortKey` order; off, its
  highest-scoring item. Items with no project ancestor pass through untouched.
- `applyDateFilter(scored, filter, today)` — the eight bands from manual §8.1.3, keyed off
  effective deadline plus target start/end. **Display only**: assert in a test that the
  score is unchanged by the filter.
- `groupByDeadline(scored, today)` — emits `GridRow` group headers (Overdue / Today /
  This Week / Later / No Deadline) for the `Group By Deadline` option.

## Task 5: Settings persistence

New `src/components/chooser/useChooserSettings.ts`, modelled directly on
`src/components/grid/useGridColumns.ts` — `useSyncExternalStore` so server render and first
paint agree on the defaults and the client then adopts what's stored.

- Key: `planner.chooser.settings.{viewId}`
- Value: partial `Weights` + the two next-action flags + `includeDeferred`
- Unknown / malformed keys fall back to the view default; `reset()` clears the entry

## Task 6: The grid tab

- `src/components/chooser/chooserColumns.tsx` — `#`, State, Pri, Name, Effort Left,
  Deadline, Status, Score. Reuse the existing cells (`AbbrStateCell`, `PriorityCell`,
  `NameCell`, `EffortCell`, `DeadlineCell`, `StatusCell`) unchanged: keep the row payload as
  `OutlineNode` and pass rank/score through the column ctx as a `Map<string, …>`, so no cell
  has to learn a new payload type.
- `src/components/chooser/ChooserGrid.tsx` — `"use client"`, built on `useGridTab` for
  selection / drawer / rename / optimistic cell writes, and `DataGrid` for rendering.
  Toolbar (matching the screenshot's selection bar): `View`, `Settings…`, `Show Less`,
  `N of M`, `Show More`, `Date`, `Advanced Filters`, plus a `Deferred` toggle and
  `Show Fields`. `Advanced Filters` drives `DataGrid`'s `enableFilters`.
- The `Project:` breadcrumb line under the toolbar renders the selected row's ancestor path.
- `src/components/chooser/ChooserSettingsDialog.tsx` — built on `ModalShell` per
  `components/modal-pattern`, a labelled number field per weight plus the two next-action
  checkboxes and Reset.
- `src/app/chooser/page.tsx` — server component, same three lines as
  `src/app/tasks/page.tsx`: `getCurrentUserId()` → `loadOutline()` → `<ChooserGrid>`.
- Add `{ id: "chooser", label: "Task Chooser", href: "/chooser", built: true }` to `TABS` in
  `src/components/shell/TabStrip.tsx`.

Per `development/testing`: no React component tests. All the reasoning lives in
`src/lib/chooser/**` and is tested there; nothing here touches the database, so there is no
`*.integration.test.ts` for this feature.

## Task 7: Verify, freeze spec, update roadmap

Verification, end to end:

1. `npm run test:unit` — confirm the new `src/lib/chooser/*.test.ts` files actually ran
2. `npm run typecheck`, `npm run lint`, `npm run build`
3. Drive the real app with the **run-planner** skill: open `/chooser`, and check
   - the default Best Overall list is score-ordered and the `#` / Score columns agree
   - switching View reorders the list and each view remembers its own settings
   - a deadline set on a _project_ moves its child tasks up the list
   - Next Action Only collapses to one row per project, and flipping
     `Use task priority order` changes _which_ row
   - each date filter changes the row count but never the Score value of a surviving row
   - Show More / Show Less move the `N of M` label
   - selecting a row fills the `Project:` breadcrumb; Enter opens the drawer
4. Reload to confirm settings and column layout persisted

Then: confirm acceptance criteria, complete **Changes from original plan**, mark `plan.md`
and `shape.md` **Status: frozen / complete (date)**, list the three dropped views and the
Parents pane under **Follow-ups (new work)**, and update `agent-os/product/roadmap.md` —
Task Chooser is named in both Phase 1 polish and Phase 2 near-term surfaces.

**Done 2026-07-30.** All four steps ran; see the acceptance criteria above.

---

## As-built map

| Area                              | Path                                                                                          |
| --------------------------------- | --------------------------------------------------------------------------------------------- |
| Route                             | `src/app/chooser/page.tsx`                                                                    |
| Grid shell + toolbar              | `src/components/chooser/ChooserGrid.tsx`                                                      |
| Columns                           | `src/components/chooser/chooserColumns.tsx`                                                   |
| Settings dialog                   | `src/components/chooser/ChooserSettingsDialog.tsx`                                            |
| Settings persistence              | `src/components/chooser/useChooserSettings.ts`                                                |
| Scoring formula                   | `src/lib/chooser/score.ts` (+ `score.test.ts`)                                                |
| Views, candidates, date filters   | `src/lib/chooser/views.ts` (+ `views.test.ts`)                                                |
| Date helpers / effective deadline | `src/lib/chooser/dates.ts`                                                                    |
| Types                             | `src/lib/chooser/types.ts`                                                                    |
| Tab strip entry                   | `src/components/shell/TabStrip.tsx` (`chooser` → `/chooser`)                                  |
| Read-path change                  | `src/lib/tree/queries.ts`, `types.ts`, `fixtures.ts` — `importance`                           |
| Dev login bypass (out of band)    | `src/lib/auth/dev-bypass.ts` (+ test), `src/lib/auth.ts`, `src/middleware.ts`, `.env.example` |

No migration: `result_area_details.importance` already existed and was simply not selected.

## Follow-ups (new work — not amendments to this frozen spec)

- **Best in Project Block view.** Needs the current project block read off the weekly
  calendar (`appointments.projectId` at the current time), falling back to Best Overall
  when no block is active.
- **Best work-related / Best personal views.** Need a dependable Work/Personal convention
  on result-area `category` — decide the convention first, then the views are two more
  entries in `CHOOSER_VIEWS`.
- **The Parents pane.** The screenshot's ancestor tree below the grid. The breadcrumb line
  covers the same question more cheaply; build this only if the breadcrumb proves thin.
- **Task predecessors**, which would unlock Achieve's advanced (predecessor-based) Next
  Action definition. A schema change, and much wider than the chooser.
- **Cross-device settings.** Move `useChooserSettings` to a table if the weights ever want
  to follow you off this machine.
