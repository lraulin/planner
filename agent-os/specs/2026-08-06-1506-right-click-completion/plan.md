# Right-Click Completion — Submenus, Missing Surfaces, Missing Commands

**Status: active**
Spec folder: `agent-os/specs/2026-08-06-1506-right-click-completion/`
Delta on the frozen `agent-os/specs/2026-08-06-1010-command-surface/`, which named this work as
its first follow-up.

## Context

The command-surface slice made one registry drive the menu bar, the icon row, the Commands
panel, the `⋯` sheet and the row menu. Right-click therefore _works_ almost everywhere — all
twelve `DataGrid` hosts pass a registry-derived `rowMenu`, `MetricsView`'s bespoke table has
one, `ColumnHeader` has its own, and long-press reaches the same menu on touch.

What is left is the content and the edges, and comparing against the Achieve screenshots in
`screenshots/right click menus/` makes the gaps concrete:

1. **The Outline — the richest view — has the poorest row menu.** `OutlineGrid.rowMenu`
   (`src/components/outline/OutlineGrid.tsx:550-595`) calls `buildGridCommands` with a _second,
   narrower_ capabilities object that omits `priorityMaintenance`, `conversionKinds` and
   `outlineZoom`. It is the only host that does not use `rowMenuFor`. So the one view with
   Convert to, Priority repair and Zoom offers none of them on right-click.
2. **No submenus.** Achieve nested `Insert ▸`, `Outline ▸`, `Actions ▸`. Ours is one flat
   sectioned list, which is why the five `Convert to` rows were deliberately kept _off_ the row
   menu for length — a command family with no right-click path at all.
3. **Right-clicking blank grid space** falls through to the browser menu. Achieve's "others"
   menu (`others right click.png`) is the row menu minus the row verbs.
4. **The Schedule week calendar has no right-click at all** — the app's largest non-grid
   surface, and `schedule right click.png` is a full menu: New Appointment, New All Day Event,
   Today, Go to Date, slot granularity, Work Week mode.
5. **Command families the screenshots show and we lack**: Complete Item(s) (`Ctrl+L`), Schedule
   Block in Calendar (`Ctrl+Alt+Shift+B`), View Project / View Tasks (`Ctrl+Shift+J` /
   `Ctrl+T`), and the row clipboard (`Pickup Row(s)` / `Paste`).
6. **`responsive.md` says the row menu is a bottom sheet below `md`**; long-press actually opens
   the same positioned popup at the press point. The standard and the code disagree.
7. **Only `Copy as text` says how many rows it is about to act on**, though `selection.count`
   is already threaded through `buildGridCommands`.

**Intended outcome:** right-click is the same menu everywhere, nests where a family would
otherwise dominate the list, exists on every surface that has rows or slots, is a sheet under a
thumb, and carries the verbs Achieve carried.

**Explicitly out of scope:** Undo/Redo (the app has no undo system — a separate feature, not a
menu change); Record Work/Expenses (no time/expense model exists); paste-as-duplicate (see
Task 7); right-click on the sidebar, Projects rail, MiniMonth, Fitness and the Weekly Plan
wizard; `View Month Calendars` / `Project Explorer` toggles (that right sidebar is
unconditionally `hidden md:flex`, so hiding it is a panel-visibility feature, not a command).

## Decisions

1. **One row-menu builder, no exceptions.** The Outline adopts `rowMenuFor`. The reason it was
   bespoke — per-row legality flags and per-row action closures — is exactly what
   `capabilitiesFor(id, count)` already provides in `useNodeCommandDeck`; the Outline gets the
   same shape and its toolbar and row menu then read one object.
2. **Submenus are declared per section, not derived from length.** A section label in
   `ROW_MENU_SUBMENUS` always collapses to one row with a fly-out, so `Convert to ▸` nests on
   every view rather than nesting on the Outline and not on Tasks. The same nesting applies
   inside the menu bar's dropdowns, because both go through `MenuList`.
3. **The blank-area menu is the row menu with no row.** `rowMenu` becomes
   `(rowId: string | null) => MenuItem[]`. Every item verb is already `disabled` with
   "Select a row first"; `navigation.md` says unavailable is not absent, so the blank menu is
   the same menu, greyed. No second list.
4. **The calendar's menu is built from `Command`s like everything else** — not a hand-written
   `MenuItem[]`, which is the drift the previous spec removed. Its commands are registered, so
   they reach `⌘K`, the menu bar and `⋯` too.
5. **Cross-navigation reuses the scope selects that already exist.** Tasks, Projects and Goals
   each hold a `scopeId` in local `useState`. It becomes `?scope=` in `viewState.ts`, which both
   makes `View tasks…` a plain navigation and fixes a real bug: the scope currently does not
   survive reload or Back.
6. **The row clipboard is a move, not a copy.** Achieve's `Pickup Row(s)` marks rows for
   relocation; `moveNode` already reparents, repositions and rejects cycles, so cut+paste needs
   **no new mutation**. Paste-as-duplicate (deep-copying a subtree) is genuinely new server work
   and is left as a follow-up.
7. **Plural labels only where the action is honestly plural.** Delete, the state changes and
   Cut act on the whole selection and say the count. Open, Rename, Indent and Convert stay
   single-row — opening three drawers is not a thing.
8. **On touch the sheet drills in; on desktop it flies out.** A 390px screen has nowhere to put
   a fly-out, so a submenu row pushes a new level into the sheet with a back row.

## Acceptance criteria

- [ ] Every view's row menu comes from `rowMenuFor`; no host calls `buildGridCommands` for a
      menu itself. The Outline's right-click offers Convert to, Priority and Zoom.
- [ ] A declared section renders as a submenu on every surface that shows it, opens on hover /
      `→` / `Enter`, closes on `←` / `Escape`, flips side when it would leave the viewport, and
      keyboard focus enters and leaves it without a dead row.
- [ ] Right-clicking blank grid space opens the same menu with row verbs greyed and a reason.
- [ ] Right-clicking a calendar slot offers creation and navigation; right-clicking an
      appointment offers open, check-state, duplicate and delete. Both reach `⌘K`.
- [ ] Complete / mark state, Schedule block, View project / View tasks, and Cut / Paste rows
      exist on the node grids, in the menus, in the palette, and disabled-with-a-reason when
      unavailable.
- [ ] `?scope=` round-trips: reload and Back preserve a scoped Tasks view.
- [ ] Below `md`, long-press opens a bottom sheet; a submenu row drills in with a back row.
- [ ] Delete, the state changes and Cut print the selection count and act on all of it.
- [ ] Unit tests for the pure parts; integration tests for any new/changed mutation path with a
      second user proving they cannot read, change or delete the first user's row.
- [ ] Typecheck, lint, unit, integration, build, and browser verification at 1280×800 and
      390×844.
- [ ] `navigation.md`, `data-grid.md` and `responsive.md` describe what was built.

## Changes from original plan

Material refinements during implementation (requirements, design, scope). Omit pure code
polish.

| #   | Change                                                                                                                                                 | Why                                                                                                                                                                                                                                                                                                                                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `ROW_MENU_SUBMENUS` became **`NESTED_SECTIONS`**, and applies to the menu bar's dropdowns as well as the row menu.                                     | The flag lives on the section, and both surfaces render it through the same `MenuList`. Nesting `Rank` on right-click but not under `Organize ▾` would be two shapes for one family — the drift this whole thread exists to remove.                                                                                                        |
| 2   | A nestable section holding a **single** command stays inline.                                                                                          | Decision 2 said "declared, not derived from length", and this is a length condition — but a fly-out onto one row is a hover you must perform to learn nothing was behind it, and it happens for real (a grid with one conversion target, a Rank section where three letters are unavailable).                                              |
| 3   | `rowMenuFor`'s second argument became **optional**, defaulting to the selection already inside the capabilities.                                       | Eight of the nine hosts were passing a selection their own `capabilitiesFor` had just built. Notes is the one real caller: its move legality comes from the view's sort, not the row.                                                                                                                                                      |
| 4   | `grid.create` (and `catalogCommands`' equivalent) gained `rowMenu: true`.                                                                              | Discovered on screen: the blank-area menu was correct and useless — every item verb greyed with "Select a row first" and nothing to click. Achieve's blank menu had live creation on it. This is the one row-menu command that does not need a row.                                                                                        |
| 5   | `ContextMenu` now ignores `blur` events that did not target the window, and its rows refuse focus on mousedown.                                        | Chrome focuses a `<button>` on press, which fires `blur` on the menu. It never showed while every click closed the menu anyway; a submenu row is the first row whose click must leave it open.                                                                                                                                             |
| 6   | **Added `Delete` to the five node-grid modules** (Tasks, Projects, Goals, Result Areas, Chooser), owned by `useNodeCommandDeck` with one confirmation. | Not in the original scope, found on screen: those modules had no delete _anywhere_ — not the toolbar, not a menu, not `⌘K`. A task created on `/tasks` could only be removed by going to the Outline and finding it there. Every other item verb they offer works in place.                                                                |
| 7   | `useStateChange`'s return is memoised.                                                                                                                 | It returned a fresh literal every render. That cost nothing while it fed only `cellHandlers`; the moment `Complete` and `State ▸` read it, the command list re-registered every render and React hit "Maximum update depth exceeded". The dev churn guard caught it on the first browser run.                                              |
| 8   | `Schedule block…` navigates to `/schedule?block=<id>`, and `ScheduleView` opens the drawer prefilled from it.                                          | A grid row has no calendar under it. The alternative was a date/time dialog on the grid, which is the calendar with the calendar taken away. `defaultBlockRange` picks the time — today at the next half hour, else 9am — with the row's own effort as the duration.                                                                       |
| 9   | Extracted `nodeDeleteMessage` / `nodeDeleteTitle` and `owningProjectId` into `src/lib/tree/`.                                                          | Six modules now delete and four navigate to an owning project. The branch warning ("and all 11 items under it") is the sentence that must not drift between copies.                                                                                                                                                                        |
| 10  | `useNodeCommandDeck` returns `dialogs` rather than `conversionDialog`.                                                                                 | It owns two confirmations now. A name that lists its contents needs renaming every time one is added.                                                                                                                                                                                                                                      |
| 11  | The calendar menu resolves its target by **hit-testing the point** (`calendarTargetFrom`), not by walking up from `event.target`.                      | FullCalendar overlays two tables: the slot rows span the whole week in one, the day columns sit in another on top. Neither is an ancestor of the other, so no `closest` walk holds both the date and the time. `document.elementsFromPoint` sees both.                                                                                     |
| 12  | Slot granularity and Work Week Mode became stored settings under a new `schedule` scope.                                                               | They are the distinctive half of Achieve's calendar menu, and a granularity you re-pick every visit is one you stop using. 6 minutes is kept, oddity and all: a tenth of an hour is how billable time is recorded.                                                                                                                         |
| 13  | The calendar's `Delete appointment` asks `window.confirm`, matching the drawer.                                                                        | Two ways to delete one appointment where only one asks is worse than either alone, and there is no undo behind it.                                                                                                                                                                                                                         |
| 14  | `DataGrid` reports its on-screen node ids (`onNavigableIdsChange`); six hosts stopped deriving them from the rows they passed _in_.                    | Found by driving it: the tabs never pushed their first list at all, so Shift-arrow walked whole-tree order — and even once pushed, that list is pre-filter. A three-row selection could hold rows the user could not see. Cosmetic while the selection only highlighted; not cosmetic once the menu prints its size and Delete acts on it. |
| 15  | `nodeDeleteMessage` / `nodeDeleteTitle` take a **list**, and count rather than list names past one row.                                                | Five titles make a dialog you skim instead of read; the number is the fact that decides whether to go ahead. The list is selection _roots_, so a child selected with its parent is not counted twice.                                                                                                                                      |
| 16  | The paste guard's reason is computed by the **host** and handed to `buildGridCommands` as three strings, rather than derived in the command builder.   | `pasteRefusal` needs every row's parent and kind, and `commandDeck` deliberately knows about neither — it takes capabilities, not a tree.                                                                                                                                                                                                  |
| 17  | `isSelfOrDescendant` was widened to take `{ parentId }` instead of a whole `DropNode`.                                                                 | So the paste guard reuses the app's one cycle check rather than writing a second that could disagree with the server's.                                                                                                                                                                                                                    |
| 18  | Two paste rows (`Paste` and `Paste as child`), not one.                                                                                                | Achieve's single `Paste` had to guess, and the guess is the whole question: dropping a task _beside_ a project and _into_ it are different moves and both are wanted. Each greys with its own reason, so "inside itself" appears on exactly the one it applies to.                                                                         |

## Task 1: Save spec documentation

This folder: `plan.md`, `shape.md`, `standards.md`, `references.md`, and `visuals/` holding the
five Achieve screenshots from `screenshots/right click menus/`.

## Task 2: Submenus in the menu model

`src/lib/commands/menus.ts`:

- `MenuSection` gains `submenu?: boolean`.
- `ROW_MENU_SUBMENUS: ReadonlySet<string>` — the section labels that nest. Start with
  `Insert row`, `Convert to`, `Rank`, `State`, `Expand`, `Zoom`, `Priority`.
- `rowMenuSections` marks matching sections; `buildMenus` marks them too, so `Organize ▾` shows
  `Rank ▸` rather than fifteen rows.

Extend `menus.test.ts`: a marked section becomes one nested section, an unmarked one stays
inline, ordering and the destructive-sinks-to-bottom rule are unchanged.

## Task 3: Submenus in the renderer

`src/components/grid/ContextMenu.tsx`:

- `MenuItem` gains `{ label, icon, items: MenuItem[] }`. `menuItemsFor` emits it for a section
  with `submenu`.
- `isCommand` must **not** match it (it is not "choosable"), but `step()` must — a submenu row
  is arrow-navigable. Introduce `isNavigable` and keep `choose` on `isCommand`, or the arrow
  keys will skip the only row that opens the family.
- `MenuList` renders a submenu row with a trailing `▸` and, when open, a nested `ContextMenu`
  panel positioned beside it, flipping left when `getBoundingClientRect()` says there is no
  room. Hover opens with a short intent delay; leaving to a sibling row closes it.
- Keyboard: `→`/`Enter` enters, `←`/`Escape` returns to the parent row.
- `ColumnMenu` also renders `MenuList` — verify it is unaffected (it passes no submenu items).

## Task 4: Blank-area menu

`DataGrid`: change `rowMenu` to `(rowId: string | null) => MenuItem[]`; add a `contextmenu`
handler on the rows container that fires only when `event.target` resolves to no row, and skips
inputs the way `DataRow` already does. Update all twelve hosts plus `MetricsView` so their
`rowMenu` callback tolerates `null` — each already has `capabilitiesFor(id, count)` that accepts
a null id.

## Task 5: New command families on the node grids

`src/lib/grid/commandDeck.ts` — new capabilities and actions, each with the placement fields:

- `stateChanges?: readonly NodeState[]` + `onSetState(ids, state)` → `record.state.<state>`,
  menu `organize`, section `State`, `rowMenu`. Complete binds `⌃L` (Achieve's `Ctrl+L`).
- `onScheduleBlock(id)` → `record.schedule-block`, menu `item`, section `Item`, `rowMenu`,
  binding `⌃⌥⇧B`.
- `onViewTasks(id)` / `onViewProject(id)` → `record.view-tasks` / `record.view-project`, menu
  `item`, section `Item`, `rowMenu`; disabled with a reason when the row has no project /
  no tasks.

Hosts wire them: `useNodeCommandDeck` (Tasks, Projects, Goals, Result Areas, Chooser) and
`OutlineGrid`. State changes reuse the existing `useStateChange` (`request`/`confirm`) so the
completion cascade and its confirmation are unchanged. Extend `commandDeck.test.ts` for the new
commands' presence, placement and disabled reasons.

## Task 6: `?scope=` and the cross-navigation targets

- `src/lib/url/viewState.ts`: add `SCOPE_PARAM`, validated with the existing `asRecordId`, into
  `ViewState`/`ViewStatePatch`; extend `viewState.test.ts` for round-trip and junk.
- `useViewStateUrl`: `scope` + `setScope` (`replace` — a lens change, like `setView`).
- `TasksGrid`, `ProjectsGrid`, `GoalsGrid`: the `scopeId` `useState` becomes the URL value; the
  existing selects call `setScope`.
- `record.view-tasks` → `/tasks?scope=<projectId>`; `record.view-project` →
  `/projects?detail=<projectId>` (Achieve's View Project opens the project).

## Task 7: Row clipboard

- `src/lib/grid/rowClipboard.ts` — pure: the buffer shape (`{ ids, sourceModule }`), and
  `canPasteInto(nodes, buffer, targetId, position)` built on the existing
  `isSelfOrDescendant` (`src/lib/tree/dnd.ts`). Adjacent test.
- A React context in `src/components/grid/` holding the buffer, so Cut on the Outline and Paste
  on Tasks are the same buffer.
- Commands `record.cut-rows` (label carries the count) and `record.paste-rows` / `Paste as
child`, menu `item`, `rowMenu`, bindings `⌘X` / `⌘V`. Paste is disabled with a reason when the
  buffer is empty, when the target is inside the cut branch, or when the module cannot host the
  kind.
- Paste runs `moveNodeAction` per row in the buffer — no new mutation. Add an integration test
  only if a batching action is introduced; otherwise the existing `moveNode` coverage stands.
  Paste-as-duplicate stays out.

## Task 8: The Schedule calendar's menu

`WeekCalendar` gains a native `contextmenu` listener on its container (FullCalendar exposes no
hook), resolving the target:

- `.fc-event` carrying `appointmentId` → **appointment menu**: Open, Mark open / done / missed
  (`setAppointmentCheckStateAction`), Duplicate (`duplicateAppointmentAction`), Delete.
- A slot or day cell → **slot menu**: New appointment here, New all-day event, Go to this week,
  Go to date…, plus slot granularity (5/6/10/15/30/60 min) and Work week mode.

Resolve the instant under the pointer from the cell's `data-date` / `data-time` attributes.
`ScheduleView` declares these as `Command`s (so they also register), builds sections with
`menuItemsFor`, and renders `ContextMenu`. `slotDuration` and `weekends` become stored
preferences alongside the existing schedule settings, with codec tests.

## Task 9: The bottom sheet on touch

`ContextMenu` branches on `useIsCompact()`: below `md` it renders through `ModalShell`
(already a bottom sheet there) instead of positioning at x/y, ignoring the press coordinates.
Submenu rows push a level with a back row rather than flying out. Confirm long-press still
reaches it from `CompactRow` and that `Escape` / backdrop dismissal work.

## Task 10: Plural labels and multi-row actions

`GridSelectionCapability` gains `ids?: readonly string[]`. `onDelete` and `onSetState` take the
id list; their labels carry `(n)` when `count > 1`, as `Copy as text` already does. Hosts'
delete confirmations say how many. Cut is plural by construction. Leave Open, Rename, Indent,
Outdent and Convert single-row.

## Task 11: Update the standards

`navigation.md` — submenus as a fourth structural device and when a section earns one; the
blank-area menu; the calendar as a menu-bearing non-grid surface. `data-grid.md` — `rowMenu`'s
nullable row. `responsive.md` — the row menu as a sheet, matching what now ships.

## Task 12: Verify, freeze spec, update roadmap

Confirm every acceptance criterion; complete **Changes from original plan**; mark files
**frozen / complete (date)**; list follow-ups as new work (paste-as-duplicate, Undo/Redo,
right-click on the secondary panels, the rebindable-shortcuts dialog still open from the
previous spec); update `agent-os/product/roadmap.md`.

## Verification

Run through the `run-planner` skill (dev server + Postgres), at 1280×800 and 390×844:

1. `/outline` — right-click a row: `Convert to ▸`, `Priority`, `Zoom` present; open a submenu
   with the mouse and with `→`; right-click blank space below the last row and confirm the same
   menu with greyed item verbs.
2. `/tasks` — Complete from the row menu on a task with open children (confirmation appears),
   `View project…`, `Schedule block…` lands on `/schedule` with the drawer prefilled; select
   three rows and confirm Delete reads `Delete (3)`.
3. `/projects` — `View tasks…` navigates to `/tasks?scope=…`; reload and press Back.
4. `/schedule` — right-click an empty slot and an appointment; change slot granularity and
   confirm it survives reload; `⌘K` finds `New appointment`.
5. Cut rows on `/outline`, paste on `/tasks`; attempt to paste a branch into itself and confirm
   the disabled reason.
6. 390×844 — long-press a row: bottom sheet; drill into a submenu and back out.

Then `npm run test:unit` (check for the Postgres skip warning), the integration tests,
`npm run typecheck`, `npm run lint`, `npm run build`.

## Note on size

This is a large spec — twelve tasks across the menu model, the renderer, four command families,
a new surface and a responsive branch. Tasks 2–4 are the structural core and are worth landing
and verifying before 5–8, each of which is independently shippable. Say the word if you would
rather split it into two specs at that seam.

---

> While this spec is **active**, a material change to requirements, design, or scope — including
> feedback on what was implemented — updates the relevant sections here and appends a row to
> **Changes from original plan**. Pure implementation detail does not. Freeze when verified.
