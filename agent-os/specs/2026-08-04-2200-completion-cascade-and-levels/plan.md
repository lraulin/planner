# Completion Cascade, and Levels You Can Dissolve

**Status: frozen / complete** (2026-08-04)
Spec folder: `agent-os/specs/2026-08-04-2200-completion-cascade-and-levels/`

Delta-spec over the frozen
[`2026-08-04-2030-type-filter-and-toolbar-cleanup`](../2026-08-04-2030-type-filter-and-toolbar-cleanup/),
which established that filtering keeps ancestors. This is what that made possible, plus the
thing it turned out to be missing.

## Context

Four threads, and the last one is the reframe:

1. **`Show completed` was still a toggle**, and still implemented by dropping a node's whole
   subtree — the one survivor of the pattern the previous spec removed everywhere else.
2. **Completion did not cascade.** Achieve completes an item's subitems with it, re-opens a
   completed parent when a subitem re-opens, and cancels subitems on cancel.
3. **`By category` was a checkbox** where every other tab groups through `Group by` — a
   standing exception to a rule already written in `data-grid.md`.
4. **The type checkboxes were not wrong, they were backwards.** Verified in Achieve: filtering
   Icon `<> Result Area` leaves the areas on screen (ancestors survive, as we now do), but the
   separate **Areas** checkbox makes result areas _not exist_ — everything under one becomes
   top-level. That is a different operation, and the one worth having.

## Decisions

| Decision              | Choice                                                                                                                                                                                                         |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cascade rule          | Settling settles open descendants; re-opening re-opens settled ancestors as `in_progress`. Re-opening never cascades down. Pure, in `lib/tree/completionCascade.ts`.                                           |
| Completed = cancelled | Both are "settled". Achieve's asymmetry (cancel reopens the parent, but a cancelled child is not completed with it) is not copied — the user asked for the interchangeable reading, and one rule holds better. |
| Confirm               | **Only when it would settle open descendants**, naming the count. Silent for a leaf or an already-finished branch, which is nearly every completion.                                                           |
| Why confirm at all    | The cascade is asymmetric, so a mis-click is not undone by reversing the gesture — re-opening the project leaves fourteen tasks completed. `ux-principles.md` reserves confirmation for exactly that.          |
| Cascade source        | The state the node **ended up in**, not the one requested. A repeating task never reaches `completed`; reading the request would settle the subtree `applyStateTransition` had just reset.                     |
| `Show completed` gone | Cascade makes it redundant: a finished branch is settled all the way down, so a State column filter removes it. No default filter is seeded — see Out of scope.                                                |
| `By category` gone    | Now `Group by → Category`, the only dimension the Outline offers. Costs one click, buys `Collapse all` and moves the setting into the grid scope with everything else.                                         |
| Levels                | `Areas` and `Goals/Dreams` switches that **dissolve a level and promote its children** (`lib/tree/flattenLevels.ts`). On means the level exists, as in Achieve.                                                |
| Which levels          | Result Areas and Goals only. Projects are what tasks belong to, and tasks nest arbitrarily, so "flatten tasks" has no level to remove — that is the Tasks tab.                                                 |
| Dreams                | Governed by the Goals switch and labelled `Goals/Dreams`. A dream is a goal with a flag at the same level; a switch that stranded it one level deeper than its siblings would be a bug with a label.           |
| Storage               | The switches live in `grid:outline`'s `switches` map, per `data-grid.md`. The whole `outline:filters` scope is deleted.                                                                                        |

## In scope (as built)

- `lib/tree/completionCascade.ts` + 16 tests; `setState` runs it in one transaction; 9 new
  integration tests including cross-user isolation and the recurrence regression.
- `useStateChange` + `CascadeConfirm`, wired into the Outline and the three list tabs.
- `lib/tree/flattenLevels.ts` + 7 tests; `Areas` / `Goals/Dreams` switches on the Outline.
- `By category` → `Group by → Category`, with `groupIds` wired so `Collapse all` appears.
- `outline:filters` scope, its parser, its tests and `OUTLINE_FILTERS_SCOPE` all deleted.
- `data-grid.md`: a **filtering is not flattening** section, a **parent's state is a claim
  about the work beneath it** section, and a third toolbar-restraint test.

## Out of scope (as built)

- **Seeding a default State filter so the Outline opens with completed hidden.** The ask was
  "we don't need a checkbox, that can be handled with a filter", and a persisted filter set
  once is exactly that. Seeding one needs `GridSettings.filters` to distinguish "never set"
  from "explicitly cleared" — the `order` / `groupBy` nullable pattern — plus a migration, or
  existing blobs (which already store `filters: {}`) would never pick it up. Worth doing on
  request; not worth inferring. **Consequence: the Outline now opens showing everything until
  the State filter is set once.**
- **Hiding one node and its descendants.** Raised as a "probably". Collapse already hides a
  subtree, and filtering plus flattening covers the rest; a persisted per-node hidden set
  needs its own way to see and undo what is hidden, which is a feature rather than a control.
- **Auto-settling a parent when its last child is done.** Achieve does not, and inferring that
  a project is finished because its known tasks are is presumptuous.

## Changes from original plan

| Change                                                           | Why                                                                                                                                                                                                                         |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cascade keys off the resulting state, not the requested one      | The first version settled a repeating task's subtree straight after `applyStateTransition` had reset it for the next occurrence, breaking an existing test. Reading the result handles recurrence without knowing about it. |
| `hiddenLevels` moved from `outline:filters` into `grid:switches` | Writing the new scope surfaced that `data-grid.md` already says per-tab toggles go in the open `switches` map. Following it deleted a whole settings scope instead of rewriting one.                                        |
| `pendingAction` moved from a module variable to a ref            | It was module-scoped in the first draft — two mounted grids would have shared one pending confirmation.                                                                                                                     |

## Acceptance criteria

- [x] Completing a project with open tasks asks once, names the count ("5 open items
      underneath will also be marked Completed"), and settles the branch on confirm.
- [x] Completing a leaf, or a project whose work is done, asks nothing.
- [x] Re-opening a task sets its settled ancestors to In progress and leaves its finished
      siblings alone.
- [x] Completing a repeating task still resets its subtree to Not Started rather than
      settling it.
- [x] A cascade cannot cross users (read, change and delete all refused).
- [x] Turning `Areas` off promotes goals and projects to the top level; turning it back on
      restores them. Rows re-depth by surviving ancestry, not a constant.
- [x] `Group by → Category` groups the Outline and brings `Collapse all` with it.
- [x] A State column filter unticking Completed and Cancelled hides finished work
      (111 → 68 rows) and keeps ancestors.
- [x] `npm test` (1578, including 16 Postgres integration files), `typecheck`, `lint` clean.

## Follow-ups (new work — not amendments to this frozen spec)

- Seed the Outline's State filter by default, if opening on everything proves annoying.
- Per-node "hide this and everything under it", if collapse turns out not to cover it.
- Flatten levels on the Projects and Goals tabs, if the Outline's version earns its keep.
