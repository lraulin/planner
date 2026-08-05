# Next Actions as a Switch, and a Sweep of the Four Tabs

**Status: frozen / complete** (2026-08-04)
Spec folder: `agent-os/specs/2026-08-04-2330-next-actions-and-tab-review/`

Delta-spec over the frozen
[`2026-08-04-2200-completion-cascade-and-levels`](../2026-08-04-2200-completion-cascade-and-levels/).

## Context

Two asks: add a **Next Actions** control to Tasks and the Task Chooser, and review Projects,
Goals, Tasks and Task Chooser for redundant or inconsistent controls.

The principle behind the first: _"I'd rather views be collections of settings, not a
collection of settings plus one special setting that you can't get any other way."_ Next
Actions was reachable only by picking the "Next Action Only" view, so you could not combine it
with any other view, and the view was doing something you could not name.

The manual (§2.6, §8.3) confirms Achieve treats it as a **flag** too, not just a view.

## Decisions

| Decision                    | Choice                                                                                                                                                                               |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Next actions rule           | Keep every summary; among sibling **leaves**, keep the first that is not settled (`lib/tree/nextActions.ts`). Matches the manual's worked Plan Party example.                        |
| Settled leaves drop out     | The list has to move: finish "Find location" and "Call to make reservations" takes its place. A next-action list still showing what you just ticked is the one thing it must not be. |
| Leaf-ness is list-local     | Judged inside the list given, not from `hasChildren` — a task whose subtasks this view filters out is a leaf here, or a view could show a summary with nothing under it.             |
| Siblings by real `parentId` | Not by row depth. Tasks re-bases depth so everything looks top-level; grouping by depth would leave one next action for the whole tab.                                               |
| Two rules, not one          | The Chooser keeps `applyNextActionFilter` (per-project, score or priority ordered). It is a flat scored list with no hierarchy, so "first leaf sibling" has nothing to mean there.   |
| Chooser surfacing           | `onlyNextAction` was already a real setting in Settings…; promoted to a toolbar toggle beside `Deferred`, which is the same "shortcut into a settings field" pattern.                |
| Tasks placement             | Applied to the **tree** before `sliceTree`, because the rule is about siblings and the slice re-bases depth.                                                                         |

### Tab review — what was found

| Finding                                                                 | Verdict                                                                                                                                                                           |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Rename` / `Open` spelled out identically on all four tabs              | **Consolidated** into `GridToolbar`'s `rowActions`. Required by `ux-principles.md`, so not removed — but a tab declares it has a selection, not two buttons.                      |
| Task Chooser showed `20 of 47` beside the chip bar's `Showing 20 of 20` | **Fixed.** Two numbers about one list that disagreed, because the grid can only count rows it was handed. One count, in the chip bar, with the host passing the real denominator. |
| Goals hard-coded `includeDeferred: true`                                | **Fixed.** The one node tab where shelving did nothing — a goal shelved until next quarter had no way to be put away. Now has `Postponed` like Tasks and Projects.                |
| `Postponed` on Tasks / Projects looked like a State filter in disguise  | **Kept.** It filters on inherited, dated shelving (`shelfHolds`), which no State value can express. The test said keep.                                                           |
| `Advanced Filters` on the Chooser gates the header funnels              | **Kept.** With the tabbed column menu it now hides the Filter tab only; the Menu tab stays, so no control is unreachable.                                                         |
| `Show Less` / `Show More`                                               | **Kept.** Not pagination in the sense `data-grid.md` rejects — the Chooser is a scored list and the limit is part of its design.                                                  |

## In scope (as built)

- `lib/tree/nextActions.ts` + 10 tests; `Next actions` switch on Tasks.
- `Next actions` toggle on the Task Chooser toolbar, bound to the existing `onlyNextAction`.
- `GridToolbar.rowActions`, replacing four copies of Rename/Open.
- One count: `GridFilterChips` now renders for the count alone when `shown < total`, and the
  Chooser passes `total: matching.length`.
- `Postponed` on Goals.
- `data-grid.md`: a **next actions is a switch, not a view** section and two more
  toolbar-restraint tests.

## Out of scope (as built)

- **Turning the `View` selects into visible collections of settings.** This is the larger
  half of the principle and it is real: `Active Task Status` and `Active Task Schedule` have
  _identical_ row filters and differ only by stored column layout, while `Completed` and `All`
  are State filters that could be chips. Making views seed visible settings needs the same
  `GridSettings.filters` "never set vs cleared" distinction that hiding completed by default
  needed last cycle — one mechanism unblocks both. Flagged, not guessed at.
- **A predecessor-based next action** (manual §2.6.4). We have no predecessors; the simple
  definition is the one that matches the data model.
- **Hiding summaries with no next action** (Achieve's companion option). Summaries staying
  matches Achieve's default, and the row is still the map.

## Changes from original plan

| Change                                                 | Why                                                                                                                                                                                                                |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Removing the Chooser's count was wrong, and got undone | The chip bar only rendered when something was narrowing, so the Chooser lost its count entirely — the user could no longer tell more rows existed. Caught in the browser. The bar now renders for the count alone. |
| The Chooser keeps its own next-action rule             | Started intending one shared function. The two operate on different shapes — a tree of siblings versus a flat scored list — and a flag to switch between them would be two functions wearing one name.             |

## Acceptance criteria

- [x] `Next actions` on Tasks shows one open step per project; completing it promotes the next
      (verified: Step one → complete → Step two).
- [x] Summaries survive; settled leaves do not; each branch gets its own next action.
- [x] `Next actions` is a toggle on the Task Chooser toolbar, not only a view.
- [x] Rename / Open behave identically on all four tabs from one definition.
- [x] The Chooser shows exactly one count, `Showing 20 of 40`, with the true denominator.
- [x] Goals has `Postponed`, and it filters.
- [x] `npm test` (1588, 16 integration files), `typecheck`, `lint` clean.

## Follow-ups (new work — not amendments to this frozen spec)

- Views as visible setting collections, together with seeding default filters — one mechanism,
  two features, and the single biggest remaining "magic" in the app.
- Hide summaries with no next action, if empty parents prove noisy.
