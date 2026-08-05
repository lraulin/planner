# References

**Status: frozen / complete** (2026-08-04)

## Achieve Planner

| Manual                                      | What it establishes                                                                                     |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| §2.6, and its two screenshots               | The simple Next Action list: summaries stay, one leaf each, and the list advances as steps are finished |
| §2.6.4                                      | The advanced definition uses task predecessors — we have none, so the simple rule is the one that fits  |
| §8.3 "Only Show Next Action(s) for Project" | It is a **flag** in the Chooser settings, "set independently for each view" — not a view-only behaviour |
| Options dialog screenshot (§2.6)            | Companion flags we did not take: hide result areas without children, hide D priorities, filter outline  |

## In-repo prior art leaned on

| Concern                                | Where                                                                           |
| -------------------------------------- | ------------------------------------------------------------------------------- |
| The Chooser's own next-action rule     | `applyNextActionFilter` in `lib/chooser/views.ts` — per project, kept as-is     |
| "Settled" as one idea                  | `isSettled` from `lib/tree/completionCascade.ts`, reused so both features agree |
| A toolbar toggle over a settings field | The Chooser's existing `Deferred` toggle, which writes `settings.states`        |
| Tab-declared switches                  | `GridToolbar`'s `switches` + `switchValue`, as Projects uses for `includeGoals` |
| Pre-slice tree reshaping               | `flattenLevels` on the Outline — same position in the pipeline, same reason     |

## Files changed

```
src/lib/tree/nextActions.ts            (new) first open leaf under each summary
src/lib/tree/nextActions.test.ts       (new)
src/components/grid/GridToolbar.tsx    rowActions; Rename/Open defined once
src/components/grid/GridFilterChips.tsx renders for the count alone when rows are held back
src/components/tabs/TasksGrid.tsx      Next actions switch, applied before sliceTree
src/components/tabs/ProjectsGrid.tsx   rowActions
src/components/tabs/GoalsGrid.tsx      rowActions, Postponed
src/components/chooser/ChooserGrid.tsx Next actions toggle, one count, rowActions
agent-os/standards/components/data-grid.md
```
