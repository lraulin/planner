# References for Main Grid Tabs

## In-Codebase Patterns to Follow

### The outline grid — the thing being generalised

- **Location:** `src/components/outline/OutlineGrid.tsx` (687 lines),
  `src/components/outline/OutlineRow.tsx` (453 lines)
- **Relevance:** the new shared grid is an extraction of these two files, not a rewrite.
- **Key patterns:**
  - `GRID_TEMPLATE` (`OutlineGrid.tsx:624`) is one hardcoded
    `grid-cols-[...]` string exported from the grid and imported by the row. Replacing it
    with a template computed from `ColumnDef[]` widths is the central refactor.
  - The optimistic layer (`OutlineGrid.tsx:107-135`): a `patches` record merged during
    render, cleared by `apply()` on every server response, accepted or rejected. There is
    no local copy of the tree.
  - Cell editors live as private components at `OutlineRow.tsx:241-453` — `NameEditor`,
    `PriorityCell`, `EffortCell`, `DeadlineCell`. Each commits on blur and Enter, reverts
    on Escape, sets `aria-invalid` and reverts on unparseable input, and calls
    `stopPropagation` so a click into a cell does not re-select the row.
  - Cells are `key`ed on the **formatted stored value** (`OutlineRow.tsx:199-209`) so a
    server-side change resets the field. The `priority:` / `effort:` key prefixes matter:
    both formatters return `""` when unset.
  - `useOutlineKeyboard` (`OutlineGrid.tsx:415`) binds to `document`, not the grid, and
    bails while `editingId` is set, while `suspended` (a drawer or dialog is open), or when
    the event target is an INPUT / SELECT / TEXTAREA / contentEditable.
  - `EffortCell` renders read-only unless `node.type === "task" && !node.hasChildren` —
    the rollup rule from `ux-principles.md`, in code.

### Derived tree values

- **Location:** `src/lib/tree/derive.ts`
- **Relevance:** the model for `status.ts` and `slice.ts` — pure, database-free, directly
  unit-tested.
- **Key patterns:** requires rows in depth-first order, parents before children; memoized
  upward walk for L.A.P.; a single backwards pass for post-order rollups; a single forward
  pass for `hidden`. Copy the shape: one exported function over an array, no I/O.

### The tree query

- **Location:** `src/lib/tree/queries.ts`
- **Relevance:** Task 4 widens it. One recursive CTE accumulating `ARRAY[sort_key]` as a
  path, ordered by that path — which is exactly the depth-first order `derive` requires.
  Rows are mapped by hand from `Record<string, unknown>`; new columns need adding in three
  places (SELECT list in both CTE arms, final SELECT, and the mapper).

### Server actions

- **Location:** `src/app/outline/actions.ts`, `src/app/outline/detail-actions.ts`
- **Relevance:** every inline edit on the new tabs writes through these unchanged.
- **Key patterns:** `run()` resolves `getCurrentUserId()` itself; actions return
  `{ ok: false, error }` rather than throwing; `runQuery<T>` carries a payload and
  deliberately does not revalidate.
- **Defect this spec fixes:** both `run()` helpers call `revalidatePath("/outline")` with
  the path hardcoded, so a mutation from `/projects` refreshes a page the user is not on.

### The detail drawer

- **Location:** `src/components/detail/NodeDetailDrawer.tsx`
- **Relevance:** opened identically from all four new tabs.
- **Key patterns:** takes the **whole `OutlineNode`**, not an id — it reads `node.type` and
  the forms read subtree rollups off it. `node: null` means closed. The drawer fetches the
  record itself and stamps the result with the id it was fetched for, guarding against a
  stale second open. Any new grid must therefore keep producing `OutlineNode`s.

### The closest thing to a reusable grid already in the repo

- **Location:** `src/components/detail/ItemList.tsx` + `src/components/detail/itemKinds.ts`
- **Relevance:** a config-driven grid over `node_items` with per-row expand-in-place
  editing, move up/down, and a delete confirm. `ITEM_KINDS` is the precedent for
  `ColumnDef[]` — a declarative record of which columns a kind shows.
- **Key patterns:** the four `wish_*` kinds each declare `columns: ["priority", "title"]`,
  which is what the Wish List tab reads. `itemKinds.test.ts` asserts every enum value has a
  config entry — copy that completeness idiom for `STATE_CODES`.

### Focus management

- **Location:** `src/components/detail/focus.ts` → `useModalFocus(ref, open)`
- **Relevance:** the Show Fields dialog and the scope-picker popovers need a focus trap and
  focus return. Already written; do not reimplement.

### Integration-test harness

- **Location:** `src/lib/tree/mutations.test.ts`
- **Relevance:** the template if `loadWishList` gets a DB test.
- **Key patterns:** `const describeDb = hasDatabase ? describe : describe.skip` so the suite
  passes with no database; a fresh throwaway user per test; cleanup by cascade in
  `afterAll`; assertions against readable `"  depth:name"` strings.
- **Constraint:** `vitest.config.ts` includes `src/**/*.test.ts` only — `.ts`, not `.tsx`,
  with `environment: "node"`. The new pure modules (`status.ts`, `slice.ts`, `filters.ts`)
  fit this; component tests would need new infrastructure and are out of scope.

## External Reference: Effexis Achieve Planner

Screenshots live at `screenshots/main tabs/`, untracked from git by Task 2 of this spec.
Referenced here by timestamp.

| Screenshot | Shows |
| --- | --- |
| `10.44.24` | **Projects tab**, grouped: `Category : Personal (3 items)` → `Result Area : Career (1 item)` → rows. Columns: State, Priorit, Name, Tasks, Effort, Effort Left, Target Start, Deadline, %, Status, L.A.P. |
| `10.44.37` | **Tasks tab**, Project scope = `Advance Career`, `Group by Area` / `Deferred` / `Project's Purpose` toggles |
| `10.44.51` | Tasks tab with **Project's Purpose** on — a labelled purpose panel above the grid |
| `10.45.10` | Achieve's **Select Project** modal: filter box, tree with `<All Projects>` / `<No Project>`, and Show Completed / Group by Result Area / Show Deferred checkboxes. Becomes a popover here. |
| `10.45.22` | Tasks **View** dropdown: Active Task Status, Active Task Schedule, Active Task Schedule Details, Completed Tasks, All Tasks, All Tasks Schedule, Active Task Template, Active Task Printing |
| `10.45.37` | Projects **View** dropdown: Active Project Status, Active Project Schedule, Active Project Purpose, Active Project Delegation, Completed Projects, All Projects, Active Project Recurrence, Active Project Printing |
| `10.45.45` | Projects tab with **Groups off** — flat, row-numbered 1/2/3, both header levels gone at once |
| `10.46.05` | **Result Area** scope picker: `All Result Areas` over a flat list of areas |
| `10.46.24` | **Goals tab**: Priority, Title, Definition, Status (`Not Started` — the state, spelled out), Deadline, Range. Grouped by Result Area. |
| `10.46.28` | Goals **View** dropdown: All Goals, Active Goals, Completed Goals |
| `10.46.54` | **Wish List tab**: Priority, Type (`W/DH`, `DW/DH`, `W/H`), Title, Description. Result Area scope only — no View dropdown. |
| `10.46.59` | The **Go** menu — the full tab inventory and its `Ctrl+G,<key>` accelerators |
| `10.47.16` | The **Actions** menu: Convert to Dream, Convert to Goal, Recurrence, Defer, Reschedule, Schedule Block in Calendar, Link Tasks |
| `10.55.41` | A **text column filter**: `(All)`, `(Custom)`, `(Blanks)`, `(NonBlanks)`, then the distinct values |
| `10.55.58` | The **Priority filter's semantic presets**: Only A1, Only Ranked As, Only Unranked As, Only As, Only As & Bs, Only As Bs & Cs, Only Bs, Only Bs & Cs, Only Cs, Only Ds, Ranked, Unranked, Prioritized, Unprioritized, (Custom) |
| `10.56.50` | A **Status filter** — `(All)`, `(Custom)`, `(Blanks)`, `(NonBlanks)`, then values |
| `10.57.07` | The **Deadline filter's date presets**: (None), (Has Date), (Past & None), (Past), (Last 7 Days), (Yesterday), (This Week Past & None), (This Week & Past), (Today Past & None), (Today & Past), (Today), (Tomorrow), (Next 7 Days), (Next 14 Days), (Next Month), (Today & Future), (Today Future & None) |
| `10.59.15` | The **row context menu**: Undo, New Project From Template, View Tasks, Complete Project, Schedule Block in Calendar, Insert ▸, Outline ▸, Actions ▸, Open Selected Items, Copy, Paste, Pickup Row(s), Delete, Customize Current View (`Ctrl+Alt+M`) |
| `10.59.38` | The **Show Fields** dialog for the Active Project Status view — Available Fields ↔ "Show these fields in this order", Move Up/Down, `Allow column filtering`, Reset Fields. The shown list is the authoritative column set and order for Task 8. |

### Field vocabulary from the Show Fields dialog

Available but unshown, worth knowing exist: Actual Effort, Actual Start Date, Assignee(s),
Completed, Contexts, Date Completed, Date Created, Description, Effort Driven, Expected
Cost, Focus, High Cost, Lead Time, Low Cost, Name (Smaller), Place, Purpose, Result Area
Name, State, Target End Date, User Bool 1, User Date 1.

Most map to existing columns in `project_details` / `task_details`; the `User Bool 1` and
`User Date 1` custom-field slots have no model here and are out of scope.

### State codes

Achieve renders `nodes.state` as a two-letter code on these grids. Confirmed by Lee:

| Code | State | Code | State |
| --- | --- | --- | --- |
| `NS` | Not Started | `P` | Postponed |
| `IP` | In Progress | `D` | Delegated |
| `W` | Waiting | `SD` | Should Delegate |
| `C` | Completed | `PR` | Proposed |
| `Cn` | Cancelled | | |

These are exactly the nine values of `nodeStateEnum`.

### Schedule status bands

Confirmed by Lee; deadline-driven, most urgent first:

| Status | Condition |
| --- | --- |
| Overdue | deadline is in the past |
| Due Today | deadline is today |
| Due Tomorrow | deadline is tomorrow |
| Close to Deadline | within 2 days |
| Due Soon | within 5 days |
| On Schedule | anything further out, or no deadline |
