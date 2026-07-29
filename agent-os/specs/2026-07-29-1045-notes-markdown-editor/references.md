# References — Notes tab with a markdown editor

## Screenshots

`screenshots/notes/` (referenced in place rather than copied into `visuals/`):

| File                                       | What it shows                                                                                                                                        |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Screenshot 2026-07-29 at 9.59.31 AM.png`  | The Notes grid — Flag / Title / Subject / Date / Contexts — with the Flag dropdown open (None, Done, Blue, Cyan, Green, Orange, Purple, Red, Yellow) |
| `Screenshot 2026-07-29 at 9.59.52 AM.png`  | The View dropdown: Simple List / Sort by Title / Sort by Date / Outline                                                                              |
| `Screenshot 2026-07-29 at 10.00.10 AM.png` | The Note Item Filter dialog — search in title / in notes / in other text fields, Subject, Contexts, Match All / Match Any                            |
| `Screenshot 2026-07-29 at 10.00.45 AM.png` | The Note Information modal — Title, Subject, Contexts, Date, Flag, Notes body                                                                        |
| `Screenshot 2026-07-29 at 10.16.17 AM.png` | Simple List view: grid on top, note text underneath; nested rows (`Foo` → `Updates to Comparison`)                                                   |
| `Screenshot 2026-07-29 at 10.20.07 AM.png` | Outline view: grid left, note text right — the same nesting                                                                                          |

Note the hint bar Achieve shows above the grid: _"Press Insert key to add row after,
Shift+Insert to add row before, Ctrl+Insert to add row as child, Esc to cancel row insert."_
Those are the keyboard bindings to match.

## Code to follow

| Need                                         | Existing example                                                                                                       |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Self-referencing tree table                  | `nodes` in `src/db/schema.ts` (`AnyPgColumn` parent ref, `nullsNotDistinct` sibling unique)                            |
| Depth-first tree load                        | `loadOutline` in `src/lib/tree/queries.ts` (recursive CTE with a `sort_key` path array)                                |
| Sibling ordering                             | `src/lib/tree/sortKey.ts` — `between`, `first`, `sequence`                                                             |
| Mutation shape + user scoping                | `src/lib/schedule/mutations.ts` (`updateAppointment` is the partial-patch model)                                       |
| Integration test harness                     | `src/lib/schedule/mutations.integration.test.ts`, `src/lib/testing/database.ts`                                        |
| Flattening a tree to grid rows               | `src/lib/tree/slice.ts`                                                                                                |
| Column filter predicates                     | `src/components/grid/filters.ts` + `filters.test.ts`                                                                   |
| Shared grid                                  | `src/components/grid/DataGrid.tsx`, `columns.ts`, `ColumnHeader.tsx`, `useGridColumns.ts`, `ShowFieldsDialog.tsx`      |
| Tree grid host: keyboard, drag, context menu | `src/components/outline/OutlineGrid.tsx`                                                                               |
| A tab whose rows are not `nodes`             | `src/components/tabs/WishesGrid.tsx` — the path we are _not_ taking, and why                                           |
| Toolbar chrome                               | `src/components/tabs/tabChrome.tsx`                                                                                    |
| Drawer + form fields                         | `src/components/detail/Drawer.tsx`, `fields.tsx` (`ContextsField` at line 575, `TextArea`, `DateField`, `SelectField`) |
| A full record drawer end to end              | `src/components/schedule/AppointmentDrawer.tsx`                                                                        |
| Detail drawer tab composition                | `src/components/detail/NodeDetailDrawer.tsx` + `FormTabs.tsx` + `{ResultArea,Goal,Project,Task}Form.tsx`               |
| Server action wrappers                       | `src/app/schedule/actions.ts`                                                                                          |
| Page shell                                   | `src/app/schedule/page.tsx` (search params, `force-dynamic`, `TabStrip`)                                               |
| Theme tokens                                 | `src/app/globals.css`                                                                                                  |

## Prior specs

- `agent-os/specs/2026-07-28-1121-main-grid-tabs/` — frozen; owns the `DataGrid`, column
  model, filters, and Show Fields that Task 4 generalises. Read before touching them.
- `agent-os/specs/2026-07-27-1100-scaffold-and-outline-tab/` — frozen; owns the outline
  tree behaviour (keyboard, indent/outdent, drag-to-reorder) the notes tree mirrors.
- `agent-os/specs/2026-07-27-1318-per-type-detail-forms/` — frozen; owns the detail forms
  that Task 9 adds markdown to and Task 7 adds a Notes tab to.

## External

- `react-markdown` — https://github.com/remarkjs/react-markdown. Does **not** render raw
  HTML unless `rehype-raw` is added; that omission is the security control here.
- `remark-gfm` — https://github.com/remarkjs/remark-gfm. Tables, task lists, strikethrough,
  autolinks.
