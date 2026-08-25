# Grid checkboxes, bulk Register category, and Outline Move to…

**Status: active**  
Spec folder: `agent-os/specs/2026-08-25-0922-grid-checkboxes-bulk-category/`

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-12-1048-finances-csv-import-register/` — Register still rides the shared DataGrid.
- **Extends:** `agent-os/specs/2026-08-23-2023-actual-categories-and-tags/` — Category is the envelope UUID; the cell still says Categorize.
- **Extends:** `agent-os/specs/2026-08-24-1522-category-by-kind-and-history/` — eligibility (`categoryAssignableIds` / off-budget and on-budget transfers), grouped picker, payee learning. The recorded catalog bulk-delete follow-up is taken up here.
- **Extends:** `agent-os/specs/2026-08-24-1945-register-prepared-rows/` — select-all uses the prepared navigable index, not mounted virtual rows.
- **Extends:** `agent-os/specs/2026-08-04-0924-grid-control-surface/` — one DataGrid; `onNavigableIdsChange` / `useNavigableIds` remain the selection order.
- **Extends:** `agent-os/specs/2026-08-06-1010-command-surface/` and `agent-os/specs/2026-08-05-2121-command-deck-and-item-actions/` — plural verbs already have `selection.ids` in `buildGridCommands`; catalog hosts never pass them. Cut/Paste stay; Move to… is a destination picker, not a second clipboard.
- **Extends:** `agent-os/specs/2026-08-19-0912-always-ranked-priorities/` — precedent for applying a field to a multi-row selection in one action.
- **Extends:** `agent-os/specs/2026-08-24-1311-budget-assign-options/` — budget tables keep `allowEmpty`; empty still means “assign all,” a filled select-all is the explicit equivalent.
- **Extends:** `agent-os/specs/2026-08-09-2133-overview-and-inbox-organizer/` — the hierarchy-aware Project Picker is the destination UI; this spec adds tasks and Top level for Outline filing without changing Organizer / Tasks-scope behaviour.
- **Extends:** `agent-os/specs/2026-07-27-1100-scaffold-and-outline-tab/` — `canNest` / `moveNode` stay the write path; multi-select drag remains out (that spec deferred it).
- **Supersedes:** the DataGrid gutter as a rank index (`rowNumbers` on list tabs, blank handle on Outline). The gutter is now a selection checkbox on every DataGrid. Named Achieve divergence on Outline (Achieve had no checkboxes and no row numbers).
- **Supersedes:** `catalogCapabilities` deleting `selection.id` while printing `selection.count`. Closes the follow-up left by `2026-08-24-1522-category-by-kind-and-history`.

## Context

Register Category is a one-row `<select>`. Multi-select already exists (Shift / ⌘ click, `useMultiSelect`) but there is no select-all, and changing Category writes one transaction. Filing an Uncategorized view means clicking every row.

The same gap shows up as a recorded catalog bug: the helper prints `Delete (3)` and deletes the focused row. Outline’s deck already threads `selection.ids`; catalogs do not.

Checkboxes in the shared gutter — replacing row numbers — are how select-all becomes one click, and they keep every grid consistent. Once Outline can select many rows in one click, **Move to…** is the matching plural: pick a parent (including a task, so a task can become a subtask) instead of indenting one row at a time.

Finance is beyond Achieve; Actual is the Category reference. Outline checkboxes are a deliberate Achieve divergence.

No toast stack exists. Skipped-ineligible and failures use the existing `GridToolbar` `ErrorBanner` or `ConfirmDialog`. Success is the cells / tree updating.

## Decisions

- **Checkbox gutter on every DataGrid**, including Outline and the three budget tables. Always visible (not Actual’s hover-only). Header checkbox: checked / indeterminate / unchecked.
- **Row numbers go away.** Remove the `rowNumbers` prop rather than leave a dead flag.
- **Select-all = currently navigable ids** (`onNavigableIdsChange`): filtered, search-narrowed, expanded; includes virtualized off-screen Register rows. Group headers are not records and are not selected.
- **Never-empty grids:** unchecking the header collapses to the focus row (same invariant as `applySelect`). **`allowEmpty` grids (budget):** header can clear to empty.
- **`⌘A` / `Ctrl+A`** is a registered **Select all** command (Item menu) when the grid is focused and the target is not a typing field. Arrow/Shift movement stays navigation, not a command.
- **Category: both cell and command.** Editing Category on a row that is in a multi-selection writes that envelope onto every selected eligible transaction. `Set category…` is a registered Item / row-menu / `⌘K` command that opens the same grouped picker (ModalShell + existing `CategorySelect`). One selected row, or a cell on a row that is not in the selection, stays single-row. Clicking the Category cell (or any other cell control) on a selected row keeps the selection — collapsing it first would make the cell a surprising single-row exception.
- **Ineligible rows are skipped**, not a refusal of the whole run. Off-budget and on-budget transfers stay ineligible. The banner reports `Category set on N of M` when any were skipped, or the existing refusal if none were eligible.
- **One bulk mutation**, not N sequential server actions. `setTransactionBudgetCategories(userId, ids, categoryId)` filters to owned, eligible rows, one `UPDATE … WHERE id IN (…) AND userId`, then payee learning once per distinct payee in the written set (same `learnFromCategoryEdit` as today).
- **Catalog Delete uses `selection.ids`.** `catalogCapabilities` grows `onDelete(ids)` and passes `ids`. Every current caller (Register, Payees, Accounts, Contacts, Resources, Time Charts, Timeline, Metrics, Jobs, Residences) confirms N and deletes N. Open / Track as bill / Rename stay singular. Payees **Merge selected** is already multi and stays.
- **Notes** already has `onDelete(ids)` but does not pass `selection.ids`; it must, or `Delete (3)` keeps deleting one.
- **Single-row path unchanged** when the selection size is 1.
- **Outline Move to…** (Organize / row menu / `⌘K`). Picker is the existing Project Picker tree **plus tasks**, plus **Top level**. Selected roots and their descendants are excluded (cannot nest a node inside itself). Selection is reduced to roots first (`selectionMoveRoots`). Moved rows land last among the destination’s children, in current outline order. Tasks/Projects/Goals grids do not get this command in this spec.
- **Partial Outline moves.** Rank and “into own descendant” are illegal for that row. If some selected roots are legal, ConfirmDialog names the skipped rows and why; Confirm moves the legal subset; Cancel leaves everything. If none are legal, that destination is refused in the picker (no confirm that can do nothing).
- **Out of scope:** bulk Payee / Notes / other Register fields; group-header-click to select a month; a toast stack; hover-only checkboxes; AG Grid / numbered pagination; changing eligibility or `canNest` rules; multi-select drag; Move to… on list grids; sending rows to Inbox as a special destination.

## Acceptance criteria

- [ ] Every DataGrid left gutter is a checkbox; no row numbers remain. Header checkbox selects / deselects all navigable rows with the never-empty vs `allowEmpty` rules above.
- [ ] `⌘A` on a focused grid (not an input) selects all navigable rows; it does not steal text-field select-all.
- [ ] Uncategorized Register: header checkbox selects every navigable transaction, including those not mounted. Changing Category on any selected row, or `Set category…`, files the eligible ones. Ineligible rows are skipped; the ErrorBanner reports the skip count when it is not zero.
- [ ] A Category cell on a row that is not in the current multi-selection still writes only that row.
- [ ] Second user cannot read, change, or delete the first user’s transactions via the bulk category (or bulk catalog delete) path.
- [ ] `Delete (N)` on a catalog grid (and Notes) deletes those N rows after one confirm, not the focused row.
- [ ] Budget Assign empty-selection = all still holds; a full header select-all on a budget table is the explicit equivalent, not a second meaning.
- [ ] Outline Move to… files selected roots (including making a task a subtask). Top level works. Own-subtree destinations are excluded. Mixed legality confirms and moves only the legal subset; a fully illegal destination is refused.
- [ ] Organizer and Tasks-scope pickers still hide tasks and still say “No Project,” not “Top level.”
- [ ] lint, typecheck, unit + Postgres tests without skip warnings, `next build`, `npm run smoke` with the dev server up, browser: Register Uncategorized bulk categorize, Outline select-all + Move to…, a catalog grid Delete (N), budget header vs empty Assign, phone viewport checkbox tap targets.

## Changes from original plan

Material refinements during implementation (requirements, design, scope). Omit pure code polish.

| #   | Change                                                                                                          | Why                                                                                                                                                                                                                                                |
| --- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Clicking a cell control (`select` / `input` / `button`) on a selected row must not replace the multi-selection. | The Category cell is the bulk control. DataGrid was calling plain `onSelect(id)` when focusing a cell editor, which collapsed the set to that row before `onChange` — so filing Uncategorized with several rows ticked only wrote the clicked one. |

## Task 1: Save Spec Documentation

Create `agent-os/specs/2026-08-25-0922-grid-checkboxes-bulk-category/` with:

- **plan.md** — this plan (**Status: active**), including empty **Changes from original plan**
- **shape.md** — shaping notes (scope, decisions, Achieve divergence, no-toast feedback, Move to…)
- **standards.md** — `@` references to the standards below (not full copies)
- **references.md** — governing specs and code studied
- **visuals/** — empty; no mockups

## Task 2: Selection helpers — select-all, header state, tests

Extend `src/lib/grid/selection.ts` (and `useMultiSelect`) with:

- `selectAll(orderedIds)` — every navigable id, focus/anchor on the current focus if it is still in the list, else the first id
- Header tri-state: `all` / `some` / `none` (none means empty on `allowEmpty`, else “only the focus row”)
- Header click: none/some → all; all → none-or-focus per `allowEmpty`
- Pure tests: empty list, one row, virtualized-length lists, never-empty uncheck, allowEmpty uncheck, prune after filter

`⌘A` binding lives in `chords.ts` and is registered once from the shared grid command builder so hosts do not each add a keydown.

## Task 3: DataGrid checkbox gutter

Replace `RowHandle` numbers with a checkbox. Header cell is the select-all box.

- Remove `rowNumbers` / `HANDLE_WIDTH_NUMBERED` and every `rowNumbers` pass site (Register, Notes, Tasks, Projects, Goals, Wish List, Result Areas, Contacts, Resources, Time Charts, Agenda, Chooser, Day, Metrics, Jobs, Residences, Timeline, Find, Amazon, Payees, Accounts, Statements, Outline currently off).
- Always-visible. Below `md`, the control uses `--tap-target`. Drag handle remains the same cell when the row offers drag (click on the checkbox selects; drag still starts from the handle area — do not make checkbox mousedown start a drag).
- `selectedIds` must be passed for the boxes to be meaningful; hosts that already use `useMultiSelect` are done. Any DataGrid that still only has `selectedId` gets `selectedIds` from `useMultiSelect` in this task if it does not already.

## Task 4: Catalog (and Notes) Delete actually uses the selection

- `catalogCapabilities`: `selection.ids`, `onDelete(ids: readonly string[])`, `record.delete` runs on those ids; label still uses `count`.
- Each catalog host: confirm copy names N; one user-scoped bulk or transactional loop of the existing single-row delete; integration test with a second user on at least Register and one other catalog (Payees or Contacts).
- NotesGrid: pass `selection.ids` so the existing `onDelete(ids)` is not fed a singleton.
- Open, Track as bill, Rename stay singular. Payees merge stays a multi-select command.

## Task 5: Bulk Category mutation

`setTransactionBudgetCategories(userId, ids, categoryId | null)` in `src/lib/finances/budget/mutations.ts`:

- Scope every read/write by `userId`
- Reuse `categoryAssignableIds` / `categoryAssignmentRefusal` — skip ineligible, do not throw the whole run
- Return `{ updated: string[]; skipped: { id: string; reason: string }[] }`
- Empty eligible set → error string the action can show (same copy as today’s single-row refusal when the only selected rows are ineligible)
- Learning: after the write, one `learnFromCategoryEdit` per distinct `payeeId` in `updated`, using that payee’s latest edited id in the batch
- Unit tests for the skip/eligibility split; integration tests including cross-user

Wire `setTransactionBudgetCategoryAction` to call the bulk helper with a one-id array, or keep the single function as a thin wrapper so one write path remains.

## Task 6: Register Category cell + Set category… command

- `onSetEnvelope` in `FinancesView`: if the edited id is in `selectedIds` and `size > 1`, call the bulk action with those ids; otherwise one id. Optimistic `patchRow` on every updated id; reload when category is grouping/filter/sort/search as today.
- `Set category…` page command (`record.set-category`): Item menu, row menu, palette; disabled with a reason when nothing selected or none eligible. ModalShell hosting `CategorySelect` (and the existing New bill / New envelope create flow).
- ErrorBanner for skip counts and failures. Do not add a toast stack.
- Uncategorized view + header checkbox is the primary filing loop to verify.

## Task 7: Outline Move to…

- Pure `planBulkMove` (or equivalent) in `src/lib/tree/`: given root ids, destination parent (or null for top level), and the tree, return `{ legal, skipped: { id, reason }[] }`. Reasons: `canNest` failure, self/descendant. Unit tests for mixed types, cycle, all-legal, all-illegal, roots reduction.
- Extend the shared picker with an opt-in that includes tasks; Organizer / Tasks scope leave it off. Top level label is **Top level**, not **No Project**.
- `Move to…` command on Outline only (`record.move-to`, Organize ▸ Move, row menu). Opens the picker with selected roots + descendants excluded.
- ConfirmDialog when `skipped.length > 0` and `legal.length > 0`. One server action moves the legal subset via existing `moveNode` in one transaction (last child, outline order). Cross-user integration test.

## Task 8: Verify, freeze spec, update roadmap

- Confirm acceptance criteria
- Update plan/shape for any material as-built drift; complete **Changes from original plan**
- Mark files **Status: frozen / complete** (date); leftover ideas (bulk Payee/Notes, group-header select, list-grid Move to…) as follow-ups
- Update `agent-os/product/roadmap.md` residual grid-chrome / finances notes if this delivers them
- Browser: Register Uncategorized, Outline select-all + Move to… (task-under-task and mixed-illegal confirm), one catalog Delete (N), budget header vs empty Assign, phone tap targets

---

While this spec is **active**, when we make a material change to requirements, design, or scope (including from feedback on what was implemented), update the relevant sections and append to **Changes from original plan**. Skip pure implementation details. Freeze when verified.
