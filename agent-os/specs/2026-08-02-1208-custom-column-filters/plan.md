# Custom Column Filters (Pragmatic MVP)

**Status: frozen / complete (2026-08-04)**  
Spec folder: `agent-os/specs/2026-08-02-1208-custom-column-filters/`

## Context

Column filters today are a multi-select checklist of presets and distinct values
(`ColumnFilter = string[]`, OR'd together). That covers "show me As and Bs" and "only
NS" but not **negation** or **multi-condition expressions** — e.g. "State is not
Cancelled AND not Completed", or "Name does not contain Archive".

Achieve exposes this via **(Custom)** in every filter dropdown → "Enter filter criteria
for {Column}" dialog (And/Or, operator, operand, multi-row). Earlier specs deferred it
(`2026-07-28-1121-main-grid-tabs`, `2026-07-31-1520-persistent-ui-state`,
`agent-os/product/roadmap.md` "Out of roadmap"). Daily use reopened it.

## Decisions

| Decision            | Choice                                                                                    | Why                                                                                                                           |
| ------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Depth               | **Pragmatic MVP**                                                                         | And/Or multi-conditions; operators by `FilterKind`. No Like / Not Like / regex.                                               |
| Surface             | **Shared DataGrid machinery**                                                             | One implementation covers Outline, Projects, Tasks, Goals, Wish List, and any filter-enabled grid.                            |
| Custom vs checklist | **Mutually exclusive per column**                                                         | Selecting a preset/value clears custom; applying custom replaces option ids. Funnel stays active either way. Matches Achieve. |
| Persistence shape   | **Discriminated union** with legacy `string[]` accepted on read                           | Old blobs keep working; new custom state needs structure, not magic option ids.                                               |
| Modal               | **`ModalShell` dialog** (OK/Cancel draft)                                                 | Same class as `NoteFilterDialog` / `ShowFieldsDialog` — blocking config, not a record editor.                                 |
| Pure logic home     | **`src/lib/grid/customFilter.ts`** (+ wire through existing `components/grid/filters.ts`) | Tripwire tests on matching; UI stays thin.                                                                                    |
| Priority compares   | `parsePriority` + `encodePriority` (A1 < A2 < B); blank fails comparisons                 | Same ordering as grid sort.                                                                                                   |
| Text matching       | Case-insensitive for contains / starts / ends / eq                                        | User expectation for title filters.                                                                                           |
| Empty custom        | Treat as **inactive** (same as All)                                                       | A dialog with zero conditions must not empty the grid.                                                                        |

## Acceptance criteria

Shipped and in daily use; frozen retroactively on 2026-08-04 by
`specs/2026-08-04-0924-grid-control-surface`, which builds on this module.

- [x] Filter dropdown gains **(Custom)...** (after `(All)`), opening a criteria dialog for that column.
- [x] Dialog: And/Or join, add/delete condition rows, operator select (kind-restricted), operand (text / date / value dropdown as appropriate; hidden for blank/nonblank).
- [x] Live expression preview, e.g. `[State] ≠ 'Cancelled' AND [State] ≠ 'Completed'`.
- [x] OK applies; Cancel discards draft; Escape closes without apply.
- [x] Matching pure-tested for text / enum / priority / date operators including blanks and And vs Or.
- [x] Persisted under existing `grid:{tabId}.filters` with backward-compatible parse of legacy `string[]`.
- [x] Preset/value selection replaces custom; `(All)` clears; reopening Custom edits saved conditions.
- [x] Funnel indicator active for custom filters; `hasActiveFilters` / clear-filters / Reset this grid treat custom as active.
- [x] Spec remains active until verified; then freeze + roadmap note that custom filters shipped (reopened from out-of-roadmap).

## Out of scope (this slice)

- Like, Not Like, Matches Regular Expression
- Cross-column expressions / global advanced find
- Saved named views / Views & Filters sidebar
- Notes tab (own `NoteFilterDialog`) and Task Chooser advanced filter UI
- Seeding custom rows automatically from the previous multi-select (nice polish, not required)
- Operand autocomplete beyond distinct values for enum columns

## Changes from original plan

| #   | Change | Why |
| --- | ------ | --- |
|     |        |     |

## Follow-ups (new work — not amendments once frozen)

Two of the original follow-ups were **delivered** by
`specs/2026-08-04-0924-grid-control-surface`:

- ~~Chip / summary of custom expression on the header~~ → the grid-wide chip bar
  (`GridFilterChips`) renders every active condition, including per-column custom
  expressions, each removable.
- ~~Cross-column expressions / global advanced find~~ → `Filter…` builds an And/Or
  expression across different columns, including ones Show Fields has hidden
  (`src/lib/grid/crossFilter.ts`).

Still open:

- Regex / Like operators if daily use asks
- Seed custom from current value ticks when opening (Custom)
- Notes keeps its own domain filter (`NoteFilterDialog`) over subjects/contexts/flags,
  renamed **Note filter…** to sit beside the grid's column `Filter…`. Unify only if the
  distinction stops being useful.

Note: `OP_META` in `src/lib/grid/customFilter.ts` was exported and renamed
`OPERATOR_META` so the cross-column builder shares one operator vocabulary instead of
forking a second.
