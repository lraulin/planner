# References for Result Areas without lifecycle state

## Achieve Planner reference pack

- `docs/achieve-planner/README.md` — precedence and document map.
- `docs/achieve-planner/user-manual.md` §5 Actions menu — Result Areas cannot be completed.
- `docs/achieve-planner/user-manual.md` §10.3 and `online-help.md` Result Areas — enduring
  roles/dimensions; documented fields omit State.
- `docs/achieve-planner/workflow-and-training.md` — Result Areas correspond to Areas of
  Focus and roles rather than finite work.
- `docs/achieve-planner/grid-columns.md` — shared Outline lifecycle columns.

## Existing Planner behavior being corrected

- `src/db/schema.ts`, `src/lib/tree/mutations.ts`, `src/lib/tree/types.ts` — shared state
  storage, mutation, and Outline contract.
- `src/lib/tree/completionCascade.ts`, `src/lib/tree/status.ts` — lifecycle propagation.
- `src/components/grid/commandDeck.ts`, `useNodeCommandDeck.tsx`, `rowSwipe.ts` — shared
  commands and phone gesture capabilities.
- `src/components/detail/ResultAreaForm.tsx`, `src/components/tabs/ResultAreasGrid.tsx`,
  `src/components/grid/commonColumns.tsx` — dedicated and Outline presentation.
- `src/lib/achieve/mapOutline.ts`, `src/lib/agent/serialize.ts`, agent outline tools —
  external contracts.

## Frozen specs amended by this delta

- `agent-os/specs/2026-08-04-2200-completion-cascade-and-levels/`
- `agent-os/specs/2026-08-05-1458-remaining-go-menu-modules/`
- `agent-os/specs/2026-08-05-2121-command-deck-and-item-actions/`
- `agent-os/specs/2026-08-08-1757-mobile-swipe-row-actions/`
