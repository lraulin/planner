# References for Grid Control Surface

## Prior specs

### Main grid tabs — the original library decision

- **Location:** `agent-os/specs/2026-07-28-1121-main-grid-tabs/`
- **Relevance:** Where TanStack Table, MUI X and AG Grid were first rejected
  (`shape.md`, "Hand-rolled shared grid; no grid library"). This spec re-opens that
  question and confirms the answer; do not re-litigate it a third time without the
  expiry condition in `agent-os/standards/components/data-grid.md` being met.
- **Key patterns:** the `ColumnDef` / `ColumnMeta` split, the `GridRow` union with group
  headers, and the rule that the outline is the shared grid rather than a sibling of it.

### Persistent UI state — the settings scope this extends

- **Location:** `agent-os/specs/2026-07-31-1520-persistent-ui-state/`
- **Relevance:** established `grid:{tabId}` in `user_settings` as the home for every grid
  preference. Everything this slice adds goes into the same scope.
- **Key patterns:** **one hook owns the whole scope** — a write replaces the scope value, so
  two hooks each persisting one field would clobber each other. See the header comment on
  `src/components/grid/useGridState.ts`. Every new setting must travel through that single
  `patch`. Also the source of the sort chip + drag-disabled rule on manual-order grids.

### Custom column filters — the operator vocabulary being reused

- **Location:** `agent-os/specs/2026-08-02-1208-custom-column-filters/`
- **Relevance:** built `src/lib/grid/customFilter.ts` — `FilterOperator`, `matchesCondition`,
  `operatorsForKind`, `describeCustom`, and the legacy-tolerant `parseColumnFilter`. The
  cross-column builder reuses all of it rather than inventing a second operator set.
- **Status note:** that spec is still marked **active** although it shipped. Task 10 of this
  spec freezes it, and absorbs two of its follow-ups — "chip / summary of custom expression
  on the header" and "cross-column expressions / global advanced find" — which this slice
  delivers.

## Code to study before starting

| Concern                                     | Where                                                                                               | What to take from it                                                                                                                                                                                                                     |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Filter evaluation and the hidden-column bug | `src/components/grid/DataGrid.tsx:294-339`                                                          | `displayRows` is the one place filter, group-collapse and sort compose. The bug is that `values` is built from the visible `columns` while `rowPassesFilters` iterates all stored filters.                                               |
| Filter matching                             | `src/components/grid/filters.ts`                                                                    | Semantic presets stay pure and testable; the grid never re-implements "is this A or B?" in JSX. Keep that.                                                                                                                               |
| Operators and conditions                    | `src/lib/grid/customFilter.ts`                                                                      | `matchesCondition`, `operatorsForKind`, `operatorNeedsOperand`, `describeCustom`. Reuse; do not fork.                                                                                                                                    |
| Hierarchy-preserving sort                   | `src/lib/grid/sortRows.ts`                                                                          | Two invariants stated in its header: group headers stay put, only siblings reorder. Multi-key sort must not weaken either. Blanks sort last in **both** directions — deliberate.                                                         |
| Grouping                                    | `src/lib/tree/slice.ts` — `emitGrouped:402`, `groupKey`, `gatherByGroupKeys`                        | The frame/`closeTo` machinery already nests arbitrarily and back-fills counts. Only the `GroupBy` union and `groupKey`'s signature need widening — `groupKey` currently sees only `entry.context`, and the new dimensions need the node. |
| Outline grouping is different               | `src/lib/tree/slice.ts` — `groupByCategory`                                                         | On the Outline the tree _is_ the arrangement and grouping is laid over it, so whole subtrees move under one header. Do not merge it into `emitGrouped`.                                                                                  |
| Settings shape and legacy tolerance         | `src/lib/settings/grid.ts`                                                                          | `parseGridSettings` never throws and never strands a tab; `order: null` means "follow the preset" and is not the same as `[]`. The `sort` → `sorts[]` migration follows the same contract as `parseColumnFilter`'s legacy `string[]`.    |
| Column state hook                           | `src/components/grid/useGridState.ts`                                                               | The single-`patch` rule, and the "stored order wins, but only for columns this view still has" degradation at `:127` — unknown filter columns should degrade the same way.                                                               |
| Toolbar primitives                          | `src/components/tabs/tabChrome.tsx`                                                                 | `ToolbarSelect` / `ToolbarToggle` / `ToolbarButton` and the below-`md` one-row scroll. `GridToolbar` is built **from** these; the primitives stay.                                                                                       |
| Drag under a sort                           | `src/components/grid/useTreeRowDrag.ts`                                                             | Takes `headerSort` / `clearHeaderSort`; becomes array-aware for multi-sort. Drag still clears any sort that is not priority.                                                                                                             |
| Dialog shell                                | `src/components/grid/CustomFilterDialog.tsx`, `ShowFieldsDialog.tsx`                                | The OK/Cancel draft pattern `GridFilterDialog` should copy.                                                                                                                                                                              |
| Density variable                            | `src/app/globals.css:40` (`--row-height`), read at `DataGrid.tsx:726,971` and `ColumnHeader.tsx:71` | Header, rows and group headers all read the one variable, so density is an override on the grid container — not three separate changes.                                                                                                  |

## Tabs to migrate onto `GridToolbar`

| Tab                                      | Unpersisted `useState` switches to fold into `settings.switches` |
| ---------------------------------------- | ---------------------------------------------------------------- |
| `src/components/tabs/ProjectsGrid.tsx`   | `groups` (`:255`), `includeGoals` (`:256`)                       |
| `src/components/tabs/TasksGrid.tsx`      | `groupByArea` (`:159`), `showPurpose` (`:161`)                   |
| `src/components/tabs/GoalsGrid.tsx`      | none — toolbar assembly only                                     |
| `src/components/tabs/WishesGrid.tsx`     | none — toolbar assembly only                                     |
| `src/components/chooser/ChooserGrid.tsx` | `advancedFilters` (`:75`)                                        |
| `src/components/notes/NotesGrid.tsx`     | toolbar assembly; keeps its own `NoteFilterDialog` this slice    |
| `src/components/outline/OutlineGrid.tsx` | toolbar assembly only                                            |

`useIncludeDeferred` already persists and keeps its **tab** scope (one toggle across every
sub-view) plus its default-true parse — fold its storage into `switches` without moving it
down to the per-view scope.

## External research

Grok's data-grid UX summary supplied by Lee during shaping — adopted: sticky headers, chips

- result count + clear-all, progressive filter levels, counts in group headers, sticky group
  headers, expand/collapse all, persisted preferences, density. Rejected with reasons in
  `shape.md`: the drag-to-group-zone panel (competes with row drag), aggregation footers
  (rollups already exist on the tree), pagination (personal data volumes).
