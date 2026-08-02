# Custom Column Filters — References

## Code

| Path                                            | Why                                     |
| ----------------------------------------------- | --------------------------------------- |
| `src/components/grid/filters.ts`                | Existing option-id matching and presets |
| `src/components/grid/ColumnHeader.tsx`          | Funnel dropdown to extend               |
| `src/components/grid/DataGrid.tsx`              | Applies `rowPassesFilters`              |
| `src/lib/settings/grid.ts`                      | Persisted filter blob                   |
| `src/components/notes/NoteFilterDialog.tsx`     | Modal draft OK/Cancel pattern           |
| `src/components/detail/ModalShell.tsx`          | Shared dialog shell                     |
| `src/lib/achieve/encodings.ts` `encodePriority` | Priority ordering for gt/lt             |
| `src/lib/tree/format.ts` `parsePriority`        | Operand → letter/rank                   |

## Prior specs

| Spec                                  | Note                                    |
| ------------------------------------- | --------------------------------------- |
| `2026-07-28-1121-main-grid-tabs`      | Deferred `(Custom)` builder             |
| `2026-07-31-1520-persistent-ui-state` | Same deferral; filter persistence shape |

## Visuals

| File                                                    | Content                           |
| ------------------------------------------------------- | --------------------------------- |
| `visuals/achieve-filter-dropdown-custom.png`            | Title filter list with `(Custom)` |
| `visuals/achieve-filter-criteria-operators-compare.png` | Criteria dialog compare operators |
| `visuals/achieve-filter-criteria-operators-text.png`    | Criteria dialog text operators    |
