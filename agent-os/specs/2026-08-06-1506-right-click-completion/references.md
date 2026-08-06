# References for Right-Click Completion

## Prior specs

### Command Surface — Menus, Icon Toolbar, and Commands Panel (frozen)

- **Location:** `agent-os/specs/2026-08-06-1010-command-surface/`
- **Relevance:** the direct parent. It built the one-registry-many-surfaces model and named this
  slice as its first follow-up, including the two specific defects repeated here (no submenus;
  the Outline's `rowMenu` capabilities omitting `priorityMaintenance` and `outlineZoom`).
- **Key patterns:** placement as a property of the command (`menu` / `section` / `icon` /
  `toolbar` / `rowMenu` / `bindings`); `pageCommands` as an override channel keyed by id;
  `toolbarSegments` deriving grouping from the weight decade rather than a second list.

### Command Deck and Item Actions (frozen)

- **Location:** `agent-os/specs/2026-08-05-2121-command-deck-and-item-actions/`
- **Relevance:** where `buildGridCommands` and `GridCommandCapabilities` came from, and where the
  disabled-with-a-reason rule was settled.

## The menu machinery being extended

### `src/lib/commands/menus.ts`

- **Relevance:** the pure menu tree. `MENU_SECTIONS` is the declared section order,
  `rowMenuSections` the row menu's own ordering (item before new, destructive sunk to the
  bottom), `overflowMenus` the phone's sheet.
- **Key patterns:** everything pure and deterministically ordered, with `menus.test.ts` beside
  it. `commandOrder` dedupes by id, last declaration winning, keeping first-insertion position —
  the mechanism `pageCommands` overrides rely on.

### `src/components/grid/ContextMenu.tsx`

- **Relevance:** the app's single menu renderer — row menus, the command bar's dropdowns, the
  `⋯` sheet, and `ColumnMenu`'s popover all go through `MenuList`.
- **Key patterns to preserve when adding submenus:** `step()` skipping separators, headings and
  disabled rows; `stopImmediatePropagation` on keydown (App Router hydrates on `document`, so
  `stopPropagation` alone never cancels the view's sibling listener); the viewport height cap
  with internal scrolling; the `requestAnimationFrame` before the scroll-closes listener, which
  skips the scroll the menu's own row selection causes.

### `src/components/grid/rowMenu.ts` and `src/components/grid/useNodeCommandDeck.tsx`

- **Relevance:** `rowMenuFor(capabilities, selection)` is the one entry point eleven hosts use,
  and `useNodeCommandDeck`'s `capabilitiesFor(id, count)` is the shape the Outline should adopt.
- **Key pattern:** the menu is **rebuilt for the row under the pointer**, not read from the
  registered list — right-clicking an unselected row selects it in the same event, so the
  registered commands still describe the previous selection when the menu opens.

## Machinery the new commands reuse

### `src/components/grid/useStateChange.ts`

- **Relevance:** Complete / mark state. Already does the optimistic branch cascade and asks for
  confirmation only when settling would settle _open_ work.
- **Key pattern:** `request(node, state, action)` applies immediately or parks; the server
  repeats the same walk in one transaction.

### `src/lib/tree/dnd.ts` and `moveNodeAction`

- **Relevance:** the row clipboard. `isSelfOrDescendant` is the cycle check the paste guard
  needs; `moveNodeAction({ nodeId, parentId, position })` is the mutation, so cut+paste adds
  none.

### `src/lib/url/viewState.ts` and `src/components/url/useViewStateUrl.ts`

- **Relevance:** `?scope=`. `asRecordId` is the validator; `setView`'s `replace` semantics are
  the model for `setScope` (a lens change is not a place you came from).

### `src/components/schedule/ScheduleView.tsx`

- **Relevance:** the calendar menu's actions all exist —
  `createAppointmentAction`, `duplicateAppointmentAction`, `setAppointmentCheckStateAction`,
  `deleteAppointmentAction`, `navigateWeek`, and `handleExternalProjectDrop`, whose payload is
  exactly what `Schedule block in calendar` needs to build.
- **Constraint:** `WeekCalendar` wraps FullCalendar, which exposes no `contextmenu` hook — the
  listener goes on the container and resolves the target from `data-date` / `data-time`.

### `src/components/detail/ModalShell.tsx` and `src/components/shell/useIsCompact.ts`

- **Relevance:** the touch sheet. `ModalShell` is _already_ a bottom sheet below `md`
  (`items-end`, `max-h-[85dvh]`, `pb-safe`), so the compact branch of `ContextMenu` is a
  different container around the same `MenuList` rather than new layout.

## Achieve reference

- **Location:** `visuals/` in this folder; the wider pack is `docs/achieve-planner/`.
- **Relevance:** the command vocabulary and the nesting (`Insert ▸`, `Outline ▸`, `Actions ▸`),
  the blank-area menu, and the calendar's slot-granularity list. Supplied as a guide to
  functionality, not a visual target.
