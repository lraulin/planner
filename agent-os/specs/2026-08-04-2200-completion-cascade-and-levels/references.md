# References

**Status: frozen / complete** (2026-08-04)

## Achieve Planner

Behaviour established by the user testing AP directly, since `docs/achieve-planner/` documents
the controls but not these semantics:

| Achieve                                                              | Us                                                          |
| -------------------------------------------------------------------- | ----------------------------------------------------------- |
| Completing an item completes its subitems, behind a confirm modal    | Same, confirming only when open descendants would settle    |
| Un-completing a subitem sets the completed parent to In Progress     | Same, and up the whole ancestor chain                       |
| Cancelling a subitem _un-completes_ the parent                       | **Not copied** — cancelled is settled, so the parent stands |
| A cancelled subitem is not completed when the parent completes       | Same, by the same rule                                      |
| Cancelling cancels subitems unless already completed                 | Same                                                        |
| `Areas` / `Goals` checkboxes dissolve the level and promote children | Same, as `Areas` / `Goals/Dreams`                           |
| Completed items are seen by switching to the "All Items" view        | **Not copied** — a State column filter, no magic views      |

## In-repo prior art leaned on

| Concern                       | Where                                                                                            |
| ----------------------------- | ------------------------------------------------------------------------------------------------ |
| Subtree walking in a mutation | `subtreeIds` in `lib/tree/mutations.ts`, already used by the recurrence reset                    |
| Single-node state transition  | `applyStateTransition` — reused per cascaded node so recurrence and day lines behave identically |
| Optimistic multi-row patching | `useOptimisticNodes.patch`, called once per cascaded row                                         |
| Confirmation surface          | `components/detail/ConfirmDialog` — the outline's delete flow                                    |
| Per-tab toggles               | `GridToolbar`'s `switches` + `switchValue`, as Projects uses for `includeGoals`                  |
| Re-depthing a derived view    | `lib/tree/derive.ts`, which computes depth for the real tree                                     |

## Files changed

```
src/lib/tree/completionCascade.ts        (new) which nodes a state change moves
src/lib/tree/completionCascade.test.ts   (new)
src/lib/tree/flattenLevels.ts            (new) dissolve a level, promote its children
src/lib/tree/flattenLevels.test.ts       (new)
src/components/grid/useStateChange.ts    (new) local cascade + the conditional confirm
src/components/grid/CascadeConfirm.tsx   (new)
src/lib/tree/mutations.ts                setState cascades in one transaction
src/lib/tree/mutations.integration.test.ts
src/components/outline/OutlineGrid.tsx   levels, Group by, cascade dialog
src/components/tabs/{Tasks,Projects,Goals}Grid.tsx  cascade dialog
src/components/tabs/useGridTab.ts        state changes go through useStateChange
src/lib/settings/outline.ts              deleted
src/lib/settings/outline.test.ts         deleted
src/lib/settings/scopes.ts               OUTLINE_FILTERS_SCOPE removed
agent-os/standards/components/data-grid.md
```
