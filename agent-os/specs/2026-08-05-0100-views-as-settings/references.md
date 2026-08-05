# References

**Status: frozen / complete** (2026-08-05)

## The pattern this follows

`GridSettings.order` and `GridSettings.groupBy` were already nullable with exactly this
contract, and `lib/settings/grid.ts` already explained why:

> Column _order_ is nullable on purpose: null means "use whatever preset this view declares",
> which is not the same as an empty layout and cannot be represented by one.

Filters were the odd one out. The work was to extend an existing decision, not to make a new
one — which is also why `parseGridSettings` was the natural home for the migration.

## Achieve Planner

The Outline's default (finished work hidden) and the Tasks/Projects "Active" views reproduce
Achieve's defaults. **Where we differ:** Achieve reaches them through views whose behaviour is
not otherwise available — its "All Items" view is the only way to see completed rows. Ours are
filters, so the same result is reachable, combinable and clearable by hand.

## In-repo prior art leaned on

| Concern                      | Where                                                                                       |
| ---------------------------- | ------------------------------------------------------------------------------------------- |
| Nullable "follow the preset" | `order` / `groupBy` in `lib/settings/grid.ts`                                               |
| Ticked-id selection model    | `lib/grid/setFilter.ts` — the shape `stateFilters` had to produce to keep the funnel honest |
| Settled as one idea          | `isSettled` from `lib/tree/completionCascade.ts`, so views and the cascade cannot disagree  |
| Per-view scopes              | `grid:{tab}.{view}`, which already made each view its own column layout                     |
| Chip wording rules           | `lib/grid/chips.ts` — the cap at three listed options was already there                     |

## Files changed

```
src/lib/grid/stateFilters.ts           (new) the State filters a view opens with
src/lib/grid/stateFilters.test.ts      (new)
src/lib/settings/grid.ts               nullable filters, v1 migration, hasAnyNarrowing
src/lib/settings/grid.test.ts
src/lib/settings/scopes.ts             SETTINGS_VERSION 1 → 2
src/lib/grid/chips.ts                  describe by exclusion; no chip when nothing is hidden
src/lib/grid/chips.test.ts
src/components/grid/useGridState.ts    GridDefaults, effective filters
src/components/grid/GridFilterChips.tsx domainOf
src/components/tabs/TasksGrid.tsx      views declare filters; keep is structural
src/components/tabs/ProjectsGrid.tsx   same
src/components/tabs/GoalsGrid.tsx      same
src/components/outline/OutlineGrid.tsx opens with finished work hidden
src/lib/metrics/layout.test.ts         asserts the version constant, not a literal
agent-os/standards/components/data-grid.md
```
