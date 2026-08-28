# References — Plan-module grab bar and live drag ids

**Status: frozen / complete** (2026-08-27)

## Governing specs

| Spec                                            | Relationship | What it decided that matters here                                                                                                                                                                                         |
| ----------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `2026-08-25-0922-grid-checkboxes-bulk-category` | Supersedes   | "Checkbox gutter on every DataGrid." Also, in Task 3: "Drag handle remains the same cell when the row offers drag… drag still starts from the handle area." That second half is what the implementation could not honour. |
| `2026-07-27-1100-scaffold-and-outline-tab`      | Extends      | The 2026-07-28 drag change block: handles own `dragstart` (arming the row on mousedown is too late); drop resolution is a pure function; `rowDrag` is opt-in.                                                             |
| `2026-08-19-0912-always-ranked-priorities`      | Extends      | Sibling priority renumber on drop; `moveNode`'s `priorityPlacement`; drag off below `md` with the command as the only path there.                                                                                         |
| `2026-07-30-2040-tc-priority`                   | Extends      | Chooser drag-to-rank with compaction, gated on the saved `rankByTcPriority` setting and an unsorted view.                                                                                                                 |
| `2026-08-04-0924-grid-control-surface`          | Extends      | One DataGrid; "Drag-to-reorder is a first-class capability, not a fallback."                                                                                                                                              |

## Commits studied

| Commit    | Date       | Why it mattered                                                                                                                                                          |
| --------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `90d91ec` | 2026-08-24 | **Root cause 1.** Stabilised the row handlers "so memo can skip rows" — which is when the memo started actually skipping, freezing each target row's drag binding.       |
| `2b55133` | 2026-08-25 | **Root cause 2.** Put the checkbox in the gutter; removed `HANDLE_WIDTH_PLAIN`/`_NUMBERED`, `rowNumbers`, and `RowHandle`'s `onClick`.                                   |
| `047d613` | 2026-08-25 | Follow-up (`cellControl` selection). Read to confirm it does not touch the drag path — it does not.                                                                      |
| `240d401` | 2026-08-19 | "Rank a whole selection in one action" — the record that a run of unprioritised rows has nothing to drag against, which explains the Chooser's refusal on unranked data. |

## Code

| Path                                                                          | Role                                                                                                    |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `src/components/grid/DataGrid.tsx`                                            | `gutter` prop, `RowHandle`'s two modes, `dragIdsRef`/`startDrag`, `dragBindingFor`, the `DataRow` memo. |
| `src/components/grid/rowDragContext.ts`                                       | The handle contract: permanently `draggable` while the context is non-null.                             |
| `src/components/grid/SelectionCheckbox.tsx`                                   | Unchanged. Its `mousedown` stopPropagation is fine now that no draggable gutter contains it.            |
| `src/components/grid/useTreeRowDrag.ts`                                       | The plain parent/position resolver Goals and Result Areas now share with Tasks and Projects.            |
| `src/components/grid/cells.tsx`                                               | `NameCell`'s `dragHandle` — the type icon as a second drag source, gated on `NameIconContext`.          |
| `src/lib/tree/dnd.ts`, `lib/tree/outlinePriority.ts`, `lib/grid/selection.ts` | Untouched; the drop _resolution_ was never the problem.                                                 |

## How the diagnosis was made

`left_click_drag` through the browser extension selects the row but never starts an HTML5
drag, so real `DragEvent`s were dispatched at the page instead: `mousedown` on
`[data-row-handle]`, `dragstart`, `dragover` at a fraction of the target row's height,
`drop`, `dragend`. The refusal showed as `dispatchEvent` returning `true` — the handler
never called `preventDefault`. Reading the target row's React fiber `memoizedProps` before
and after `dragstart` showed the same object and the same `onDragOver`, which is what named
the memo as the cause. Forcing a re-render in between (toggling Roomy/Dense) made the same
`dragover` accept, confirming it.
