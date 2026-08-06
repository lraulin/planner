# References

**Status: frozen / complete (2026-08-05)**

## Existing implementation

- `src/lib/commands/registry.ts` — canonical command shape, matching, merge, overflow filtering.
- `src/components/shell/CommandProvider.tsx` — contextual registration lifecycle.
- `src/components/shell/OverflowMenu.tsx` and `CommandPalette.tsx` — shared renderers.
- `src/components/grid/GridToolbar.tsx` and `src/components/tabs/tabChrome.tsx` — grid header
  and responsive toolbar primitives.
- `src/components/grid/useNodeCommandDeck.tsx` — shared conversion and priority capabilities
  for node-list projections.
- `src/components/outline/OutlineGrid.tsx` — existing tree insert, move, priority-drop,
  expand/collapse, delete, keyboard, and detail handlers.
- `src/lib/tree/mutations.ts` / `src/app/outline/actions.ts` — user-scoped tree mutations.
- `src/lib/tree/hierarchy.ts` — legal nesting and Dream/Goal representation.
- `src/lib/priority/letterRank.ts` and `src/lib/tree/outlinePriority.ts` — sibling/letter ranking
  rules to extend without touching the database from pure code.
- `src/lib/url/viewState.ts` / `useViewStateUrl.ts` — shareable view URL state and Back behavior.

## Achieve reference pack

- `docs/achieve-planner/workflow-and-training.md`: Outline zoom and next-action workflow.
- `docs/achieve-planner/user-manual.md`: Outline/tree actions, priorities, and conversion intent.
- `docs/achieve-planner/online-help.md`: command/menu vocabulary and keyboard discoverability.

## Visuals

No supplied raster screenshots were present in the workspace. `visuals/` is retained as the
location for future supplied references; the shaping wireframe above is the working visual pointer.
