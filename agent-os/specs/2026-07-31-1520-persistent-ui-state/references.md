# References for Persistent UI State + Unified Grid Controls

**Status: frozen / complete** (2026-07-31)

## Patterns to borrow

### Defensive parse of a user-editable blob — the model to copy

- **Location:** `src/components/chooser/useChooserSettings.ts:57-108` (`parseSettings`)
- **Relevance:** exactly the problem `src/lib/settings/parse.ts` has to solve.
- **Key patterns:** merge stored over defaults; accept a weight only if it is a finite
  number; keep only enum values that still exist in the schema, so a renamed state degrades
  to "not shown" rather than a filter matching nothing; **honour an explicitly empty list**
  rather than treating it as absent, so the checkboxes do not lie.

### `useSyncExternalStore` over storage, no effect

- **Location:** `src/components/grid/useGridColumns.ts:77-89`, `useChooserSettings.ts:111-115`
- **Relevance:** both hooks get re-pointed at the new provider; their read discipline is why
  there is no flash of the wrong ordering on first paint.
- **Key patterns:** snapshot returns a referentially stable primitive (a raw string, or a
  `\0`-joined key) so React does not loop; the server snapshot returns the default.

### Server actions + the multi-user seam

- **Location:** `src/app/day/actions.ts:16-22` (the `run()` helper), `src/lib/auth.ts`
  (`getCurrentUserId`)
- **Relevance:** `src/app/settings/actions.ts` copies this verbatim.
- **Key patterns:** each action resolves the user itself so no caller can pass one in; return
  `{ ok: false, error }` rather than throwing; `revalidatePath` after a write.

### Pure, tested URL helpers

- **Location:** `src/lib/fitness/routes.ts` + `routes.test.ts`
- **Relevance:** the precedent for `src/lib/url/viewState.ts`.
- **Key patterns:** path/param construction lives in `src/lib/**` as pure functions with
  tests, not inline in components. Also worth reading: `src/app/fitness/page.tsx:26-31`,
  which redirects legacy `?log=1&session=` deep links to path routes — evidence this codebase
  has already moved _away_ from query params where a path was the better fit.

### A non-`OutlineNode` payload through the shared grid

- **Location:** `src/components/notes/NotesGrid.tsx`, `notesColumns.tsx`
- **Relevance:** the template for migrating Wish List, whose rows are `node_items` rather than
  `nodes` — the stated reason it hand-rolled its own grid.
- **Key patterns:** `DataGrid<TCtx, TRow>`'s second type parameter; a `ColumnDef<Ctx, Row>[]`
  module; all callbacks carried in one `columnCtx` object.

### Existing UI state already in Postgres

- **Location:** `src/db/schema.ts:277-278` (`nodes.focus`, `nodes.collapsed`), `:940`
  (`notes.collapsed`), written via `setCollapsedAction` (`useGridTab.ts:52-56`)
- **Relevance:** per-row UI state is already server-persisted. This spec extends the same idea
  to per-view preferences; it is not a new category of data for the app.

## Code to change

| Area                                          | Path                                                                                                                              |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Grid core (sort/filter state, group collapse) | `src/components/grid/DataGrid.tsx:122-123`, `:196-227`                                                                            |
| Column model + template builder               | `src/components/grid/columns.ts`                                                                                                  |
| Filter model + presets                        | `src/components/grid/filters.ts`, `filters.test.ts`                                                                               |
| Filter dropdown / header                      | `src/components/grid/ColumnHeader.tsx`                                                                                            |
| Column layout store                           | `src/components/grid/useGridColumns.ts`                                                                                           |
| Column chooser dialog                         | `src/components/grid/ShowFieldsDialog.tsx`                                                                                        |
| Shared tab state (drawer id)                  | `src/components/tabs/useGridTab.ts:29`                                                                                            |
| Duplicated column defs                        | `src/components/outline/outlineColumns.tsx`, `tabs/TasksGrid.tsx:57`, `tabs/ProjectsGrid.tsx:91`, `chooser/chooserColumns.tsx:73` |
| Hand-rolled grid to retire                    | `src/components/tabs/WishesGrid.tsx` (literal `gridTemplateColumns` at `:168` and `:230`)                                         |
| Copy-pasted `collapsedGroups` blocks          | `TasksGrid`, `ProjectsGrid`, `GoalsGrid`, `ChooserGrid`, `OutlineGrid`                                                            |
| Non-column filter systems to fold in          | `src/lib/notes/filter.ts` + `notes/NoteFilterDialog.tsx`, `outline/OutlineGrid.tsx:76-79`                                         |
| Chooser settings store                        | `src/components/chooser/useChooserSettings.ts`                                                                                    |
| Drawer active tab                             | `src/components/detail/NodeDetailDrawer.tsx:147`                                                                                  |
| Root layout (provider mount)                  | `src/app/layout.tsx`                                                                                                              |
| Schema                                        | `src/db/schema.ts`                                                                                                                |

## Prior specs

| Spec                                    | Relationship                                                                                                                                                                                                    |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `2026-07-28-1121-main-grid-tabs`        | Built `DataGrid`, Show Fields, column filters. Its "no user-settings table" decision (`shape.md:82`) is **superseded** here.                                                                                    |
| `2026-07-30-1858-task-chooser`          | Established per-view `localStorage` settings (`shape.md:66`). Also **superseded**.                                                                                                                              |
| `2026-07-28-1234-weekly-schedule`       | Exemplar frozen spec; format followed by this folder. Also the origin of the `?week=` / `?chart=` URL-param precedent.                                                                                          |
| `2026-07-27-1318-per-type-detail-forms` | `shape.md:73` records that a URL search param with server-rendered detail was **considered and rejected** at the time. Task 8 revisits that with client-side `useSearchParams`, which is a different mechanism. |

## Visuals

None. The work is behavioural, against existing UI.
