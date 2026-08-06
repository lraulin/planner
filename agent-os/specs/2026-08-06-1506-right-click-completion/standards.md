# Standards for Right-Click Completion

The following standards apply to this work. Full text, copied at shaping time so the spec
remains readable if the standards later move on.

---

## components/navigation.md

# Navigation & Commands

> For the philosophy these rules serve, see `ux-principles.md`. For how each surface
> reshapes below the breakpoint, see `responsive.md`.

Achieve Planner reached all sixteen of its views through the **Go** menu, and kept only the
ones you had opened as tabs. We inherited the tabs without the Go menu, so every view had to
be a permanent tab and the eleventh was already too many.

Five surfaces now, each answering a different question.

| Surface                      | Question it answers            | Where                          |
| ---------------------------- | ------------------------------ | ------------------------------ |
| **Sidebar** (`⌘K` to search) | "Where can I go?"              | Desktop, always                |
| **Menu bar**                 | "What can I do here?"          | Every view's command row       |
| **Commands panel**           | "…show me all of it at once"   | Desktop, opt-in, remembered    |
| **Row context menu**         | "What can I do to _this_ row?" | Right-click / long-press a row |
| **Command palette** (`⌘K`)   | "What can this app do?"        | Desktop, on demand             |

Below `md` the sidebar is replaced by the bottom nav plus the More sheet, there is no palette and
no command row, and no panel — **`⋯` becomes the menu bar**, rendering the same tree with the
section names as headings. See `responsive.md`.

Achieve had four of these five (menu bar, icon toolbars, the docked **Outline Commands** pane, and
a sectioned row menu), all reading one command set. The palette is ours; the point of the others is
that they were right.

## Modules live in one registry

`src/components/shell/modules.ts` is the only list of modules. It is read by the sidebar, the
phone bottom nav, the More sheet, the phone header's "you are here" title, and the palette's
go-to entries.

**Never hard-code a module anywhere else.** Five surfaces reading one array is what stops the
phone and the desktop from disagreeing about what the app contains — the previous version of
this file was four surfaces reading `TABS`, and that was already the reason it worked.

### Sections, and reserved modules

Modules are grouped into ordered sections (`Plan`, `Do`, `Track`, `Library`). Both the sidebar
and the More sheet render `sectionsWithModules()`, so the two group the app identically.

A module we have decided the home of but not built is marked `status: "reserved"`. It renders
nowhere and is not a navigation target; a section holding only reserved modules does not render
at all.

- **Do** decide a future module's section when you know it. It costs a line and it stops the
  next person re-arguing navigation.
- **Do not** render a reserved module as a disabled or "coming soon" entry. A menu full of dead
  rows teaches the reader to stop reading the menu, and then the live rows stop working too.

## Commands live in one registry

`src/lib/commands/registry.ts` defines what a command is. A module publishes its own with
`useRegisterCommands` and every renderer reads them through `useCommands`.

**One registry, every renderer.** A command described in two places is a command whose two
descriptions eventually disagree about whether it is available, what it is called, or which key
fires it. All three have happened here: eight views hand-wrote their row menus and one said
`Open record` where its own toolbar said `Open`; the Notes grid printed `Ctrl+Insert` and
`Shift+Tab` where the rest of the app printed `⌃Insert` and `⇧Tab`.

### A command declares its own placement

`menu`, `section`, `icon`, and optionally `toolbar` (a weight, meaning "also give me an icon
button") and `rowMenu`. `src/lib/commands/menus.ts` turns those into the menu tree, the icon row,
and the row menu.

Placement belongs to the **command**, never to the surface. A surface that filtered the list
itself would be a second placement rule, in a second file, that has to agree with the first — which
is what the Outline's twelve-id row-menu allowlist was, a thousand lines from the command it was
filtering.

`MENU_SECTIONS` is the declared section order per menu. It is a table rather than "whatever order
the commands were built in", because build order is an accident of which hook ran first and a menu
whose rows move between views is a menu you re-read every time.

### A command declares its own binding

`bindings`, and the printed shortcut is **derived** from it (`formatBinding`). There is one
`document` listener for all of them (`CommandKeys`), not one per view.

`Command.shortcut` used to be a string typed beside the label while the key that fired it lived in
a `switch` in whichever view owned a listener — eleven of them. Nothing in the app connected `"⌥↑"`
to `event.altKey && event.key === "ArrowUp"`, so a menu could promise a chord for years after the
handler stopped accepting it.

**Selection movement is not a command.** Arrow keys and shift-extend walk a row set; they have no
label, no menu row and no icon, and they stay in the view that owns the selection. If it belongs in
a menu it gets a binding; if it does not, it does not.

### No command is palette-only

`ux-principles.md`: _a gesture nobody can see is not a discoverable action_ — and there is no
`⌘K` on a phone. Every command must have a visible, tappable path, which in practice means
`⋯` unless it already has its own button.

This is the rule that makes the palette legal. Adding a command to the palette alone is not
shipping it; it is shipping it for the one person who already knew it was there.

### Complete everywhere, sectioned everywhere

Every surface lists everything it is responsible for, and **sections** are what keep that
readable. "Short" was the old answer and it was the wrong one: the `⋯` menu was kept short by
leaving things out and unsorted, which is how it ended up as a traditional app menu with the
organization removed.

- The **palette must be complete.** A Go menu that omits things is one you stop trusting, and
  then you stop opening it.
- The **menu bar must be complete too.** It is the desktop's primary surface; a command that is
  in neither a menu nor on the icon row does not exist to anyone not already holding `⌘K`.
- The **row menu is the one narrow surface**, because it is about one row. A command opts in with
  `rowMenu`, and it is the same command with the same label — not a hand-written near-copy.

`ownControl: true` is the one exclusion, and it means something narrow: a _non-command widget_ on
the lens row already controls this (`Filter…`, `Group by`, density). `⋯` skips those and only
those, because on a phone that widget is the thing still on screen. Commands promoted to the
desktop icon row are **not** skipped — that row does not exist down there, so `⋯` is the only place
they live.

### Unavailable is not absent

A command that cannot run right now — nothing selected, no groups to collapse — is
`disabled`, not filtered out, with `title` saying why. A command that vanishes teaches you it
does not exist; a greyed one with "Select a row first" teaches you how to use it.

### Where a control belongs

Three tiers, and a control should sit in the lowest one that still works:

| Tier                | For                                                                         |
| ------------------- | --------------------------------------------------------------------------- |
| **On the bar**      | Used most sessions. An icon button (`toolbar`), or a widget on the lens row |
| **In a named menu** | Real commands used occasionally (`Show Fields`, `Convert to…`, the zooms)   |
| **Palette only**    | Nothing. See above.                                                         |

`data-grid.md`'s toolbar tests still apply first: a control that is a column filter wearing a
checkbox, or whose only two states are "unavailable" and "duplicated", does not belong in any
of the three tiers — it belongs deleted.

## Shell state is a setting, not a `localStorage` flag

The sidebar's collapsed state and the Commands panel's open/collapsed state live in
`user_settings` under the `shell` scope, because they are the first things painted. Settings load server-side in `src/app/layout.tsx` precisely so a
stored preference arrives in the first HTML; a rail that renders expanded and then snaps shut
on every navigation is the most visible possible version of the flash that decision exists to
prevent.

Anything else the shell remembers goes in the same scope, and its parser must return defaults
for an unusable blob rather than throwing. It runs before the first paint: an exception there
does not break one grid, it breaks the app.

## Events, not a provider, for "open this"

The palette and the capture dialog own their own open state. The buttons that open them are
siblings, not descendants, so they dispatch a `window` event (`shell/commandEvent.ts`,
`capture/event.ts`) rather than forcing a provider into the root layout — which would also
hand the surface to `/login`, where it does not belong.

The keyboard shortcut is _not_ a dispatch of that event. `⌘K` and `c` are document listeners
inside their own components, because they need the `isTypingTarget` and `isModalOpen` guards
from `src/lib/keyboard.ts`, and those belong with the component that knows what it is doing.

## Testing

The registry's matching and merging, the menu tree (`menus.ts`), the binding match/format
(`bindings.ts`) and the shell settings codec are pure and live in `src/lib/` with tests. The
sidebar, menu bar, panel, palette, provider and overflow button are wiring and get none —
`testing.md`. Verify them in a real browser via the `run-planner` skill.

Two of those tests exist because the mistake is invisible otherwise:

- **`formatBinding` over the whole printed vocabulary.** These strings are on screen in menus, the
  panel, the palette and the outline hint bar, so a change to them should have to be deliberate.
- **`matchBinding` matches modifiers exactly.** `Insert`, `⇧Insert` and `⌃Insert` are three
  different commands. A binding that ignored the modifiers it did not name would make plain
  `Insert` fire on all three, and which one won would depend on dispatch order.

One runtime guard is load-bearing: `useRegisterCommands` re-registers on array identity, and
registering sets provider state. Anything in a command list's dependencies must be
identity-stable — a `useCallback` returned from a hook, not a bare arrow. Its dev churn detector
has caught this twice, most recently on the Commands panel's own `setOpen`.

---

## components/data-grid.md

# Data Grid

How every list in this app works. Read `ux-principles.md` first — this is the grid-specific
application of it.

There is **one** grid: `src/components/grid/DataGrid.tsx`, driven by `ColumnDef[]` and a
persisted `GridState` (`useGridState`), with its controls assembled by `GridToolbar`. The
Outline, Projects, Tasks, Goals, Wish List, Notes, Task Chooser and the Day list are all the
same component. A new list is a column array and a row slice, not a new grid.

## The one rule everything else serves

**Hierarchy survives every operation.** Sorting, filtering, searching and grouping change
_which_ rows you see and _in what order siblings appear_ — never who a row's parent is.

- **Sort reorders siblings only.** A sub-project never floats above its parent because its
  priority is higher; its subtree travels with it. `src/lib/grid/sortRows.ts` owns this and
  its two invariants are stated at the top of that file. Multi-column sort does not weaken
  them: extra keys refine how two _siblings_ compare and cannot change who is a sibling.
- **Group headers stay put** and never absorb rows from a neighbouring group.
- **Filtering keeps the shape.** A group header whose rows have all been filtered out is
  dropped; one that survives **restates its count** to the number actually under it. A
  header reading "Career (7)" above one visible row is a claim the user can see is false.
- **A surviving row brings its ancestors with it** (`lib/grid/ancestors.ts`), so a matching
  task is never left indented three levels under nothing. This applies to the column
  funnels, the advanced filter and the search box alike, and it is what makes filtering by
  type behave the way Achieve does. Ancestors count as shown — `Showing N of M` is the
  number of rows you can count on screen, not the number that matched.

### Filtering is not flattening

Two different questions, and conflating them is what made the Outline's old type checkboxes
wrong in both directions:

| Question                                | Control                                     | Behaviour                                                          |
| --------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------ |
| "Which rows do I want to look at?"      | Column filter / search                      | Matches keep their ancestors; the shape is preserved               |
| "Stop organising my work by this level" | Outline's `Areas` / `Goals/Dreams` switches | The level is dissolved and its children **rise** to take its place |

`lib/tree/flattenLevels.ts` owns the second. It re-depths survivors from their surviving
ancestry rather than subtracting a constant, because how many hidden levels a row sat under
varies branch to branch. The tree is untouched — this is a view, and switching the level back
on restores every row.

Only organising levels are flattenable. Projects are what tasks belong to and tasks nest
arbitrarily, so "flatten tasks" has no level to remove; a flat task list is the Tasks tab.

**Never filter a tree by dropping a node's subtree with it.** That is the inverse mistake
and it hides work you explicitly asked to see: the Outline once filtered type and focus that
way, so unticking "Result Areas" emptied the entire grid and a focused task under an
unfocused project disappeared. The one place it is correct is `showCompleted`, because
settling a project genuinely settles the work beneath it — and that is a pre-grid reshape of
the tree, not a column filter.

This is the reason we did not adopt a grid library. See "Why hand-rolled" below.

## Drag-to-reorder is a feature, not a fallback

Dragging a row is how work gets prioritised here, and dropping renumbers priority letter and
rank among the destination parent's children (`useTreeRowDrag`, `lib/tree/outlinePriority`).

- Drag is **compatible with a priority sort** and cleared by any other, because any other
  sort would immediately move the row away from where it was just dropped. Say so on screen
  rather than silently refusing.
- Drag is **desktop-only**. Below `md` the equivalent lives in the long-press menu — see
  `responsive.md`. Never make drag the only path to an outcome.
- **Dragging a column header reorders columns**, and is the one configuration gesture that
  earns its place: it starts on the header label, not on a row, so it cannot be confused
  with a row drag, and its outcome is also on the column menu as Move left / Move right.
  The header row accepts a drop only while a header drag is in flight, so a row dragged
  over it gets the browser's no-drop cursor rather than looking like a column move.
- Do **not** overload the gesture any further. A drag-a-column-header-into-a-zone Group By
  panel (AG Grid's pattern) is still out: it gives one gesture two meanings depending on
  where you let go, and grouping is a toolbar picker here for exactly that reason.

## Grouping

- **Up to three levels**, chosen from progressive `Group by` / `then by` selects that appear
  as the level above them is filled. A dimension appears once — choosing one already in use
  moves it rather than nesting it inside itself. Clearing a level truncates the ones below,
  because there is nothing left for them to sit under. Rules live in `setGroupLevel`.
- **A tab's default arrangement is its default `groupBy`, never a separate toggle.** Projects
  opens on Category → Result Area; that used to be a `Groups` switch beside the picker, which
  meant `Group by → (None)` still showed headers. One control per thing, and the control
  shows the current state.
- This is why `groupBy` is `string[] | null`: null follows the tab's default, `[]` is the
  user having turned grouping off. Same distinction as `order`, and for the same reason.

## Inherited values are computed once, in `derive`

A value a row gets from its ancestry — L.A.P., shelving, category — is computed **once** in
`src/lib/tree/derive.ts` as a memoized walk up the tree, and exposed as a field on
`OutlineNode`. Never re-derive one at the point of use.

The rule is written against the **field**, not the type: category is set only on Result
Areas in practice, but `effectiveCategory` takes the nearest self-or-ancestor carrying one
whatever its type. Special-casing by type is how a value ends up meaning one thing to the
grouping code and another to the column.

**An inherited value that can be grouped by must also be a column.** Grouping by something
the grid cannot show is a header the user cannot account for — they can see the sections but
not the value that made them, cannot filter by it, and cannot sort by it. Category was in
exactly that state before it became a column.

## Filtering, searching and grouping act on _defined_ columns, not visible ones

Show Fields hides a column. It does not un-ask the question you asked about it.

- `DataGrid` takes both `columns` (visible, get a track and a cell) and `allColumns`
  (everything the tab defines). Filters, the advanced builder, quick search and the value
  pickers all evaluate against `allColumns`.
- A filter naming a column that **no longer exists** is **inert**, never failing. Treating a
  missing column as a blank cell empties the grid with nothing on screen to explain it —
  the exact bug this rule was written after. Same posture as `useGridState`'s degradation of
  a stale column `order`.
- **Sort is the exception**: sort keys resolve against the _visible_ columns. A filter on a
  hidden column is legible from its chip; a sort on one is a grid that has silently
  rearranged itself.

## A parent's state is a claim about the work beneath it

Settling a node settles the open work under it; re-opening one re-opens the settled nodes
above it, as `in_progress` — something under it _has_ been done. `lib/tree/completionCascade.ts`
owns the rule; `setState` runs it in one transaction so a branch is never half-settled, and
`useStateChange` repeats it locally so the other rows move on the same frame.

- **Completed and cancelled are interchangeably settled.** Achieve reopens a completed parent
  when a child is cancelled but does not complete a cancelled child when the parent completes;
  one rule that treats both as "not coming back" is easier to hold than two that disagree.
- **Re-opening never cascades downward.** Re-opening a project must not undo twenty tasks that
  really were finished.
- **That asymmetry is why settling asks first** — and only when it would settle _open_
  descendants, naming the count. A leaf task, or a project whose work is already done, goes
  straight through. This is not Achieve's confirm-on-every-tick.
- **Cascade from the state the node ended up in, not the one requested.** Completing a
  repeating task steps it to the next occurrence and resets its subtree; reading the request
  would settle the children that were just cleared for the next round.

**This is why there is no "Show completed" toggle.** A finished branch is now settled all the
way down, so an ordinary State column filter removes it — visible as a chip, clearable with
everything else, no special case in the row walk.

## The column menu is where everything that acts on a column lives

Every header cell carries one `▾` button (`ColumnMenu.tsx`) opening a **tabbed** popover:
**Filter** (the funnel described below) and **Menu** (sort, layout, and the grid-wide column
dialogs). Right-clicking anywhere on a header cell opens the same menu, the way a Windows
list header does.

The problem it solves is that the controls used to be grouped by _mechanism_ rather than by
_target_: sort was a click on the label, filter was a funnel, hiding and reordering were in a
toolbar dialog, and resetting a width was a double-click on a handle you could not see.
Knowing what you wanted to do told you nothing about where to do it.

- **One button, not two.** A separate funnel and menu do not fit beside a label in a 48px
  header cell (Priority, Icon). Tabs are how AG Grid and MUI X solve the same problem.
- **The Filter tab opens by default on any column that has one**, so the button costs
  exactly what the funnel cost on the path taken most. Everything else is one tab away
  rather than somewhere else entirely.
- **Items are disabled, not omitted**, with a `title` saying why — "This column cannot be
  hidden" is the difference between an unavailable control and a broken one. Same posture as
  `(Select all)` when nothing is filtered. The rules are pure and tested in
  `lib/grid/columnMenu.ts`; the component asks and renders, and never re-derives one.
- **The menu tab must never scroll.** A menu whose last two items are below a fold looks like
  a menu that does not have them. Only the filter's value list scrolls.
- **The gestures on the header are shortcuts to menu items, never the only path.** Click to
  sort, Shift-click to add a key, drag to reorder, double-click the handle to reset a width —
  each also appears in the menu, which is where the keyboard and the un-initiated find it.
- Grid-wide entries (`Show fields…`, `Reset columns`) repeat what the toolbar offers **on
  purpose**. That repetition is the feature; it is what stops the menu from being a partial
  answer that sends you to the toolbar anyway.

`DataGrid` receives the layout commands as one `columnControls` bundle (`ColumnControls`,
returned ready-made by `useGridState`) rather than six props at eight call sites. A grid that
cannot persist a column layout should not be able to offer half a menu — omit the bundle and
those items are visibly unavailable.

## One type glyph per row, and the column set decides where it goes

The row's type is available as two columns rendering the same value, and **only one of them
ever draws the glyph**:

| Column          | Field list  | Shows                                | Use it to                     |
| --------------- | ----------- | ------------------------------------ | ----------------------------- |
| `icon` (3rem)   | `Type icon` | The glyph, in a column of its own    | Reproduce Achieve's layout    |
| `type` (5.5rem) | `Type name` | `Result Area` / `Goal` / `Dream` / … | Filter, sort or group by type |

By default the glyph sits in the Name cell, after the indentation, where it names the thing
you are reading — this is a deliberate departure from Achieve, which puts icons in a flat
column and leaves the tree as bare text. Showing the `icon` column moves it there instead
(`NameIconContext`), so the two can never both draw it; hiding the column hands it back.
That makes `icon` a **placement choice**, not a duplicate.

`type` exists so filtering by type never costs you the icon beside the name. It sorts in
hierarchy order rather than alphabetically — a Task filed above a Result Area is backwards
for a column whose subject is the levels of the tree.

**A grid-wide fact belongs in a context, not in `ColumnDef`.** The Name cell has no business
knowing which other columns are on screen, and threading it through every tab's column
context would make eight files care about a question only `DataGrid` can answer.

## Next actions is a switch, not a view

Achieve's simple **Next Action Only** list keeps every summary row and, among sibling
_leaves_, only the first one still open (`lib/tree/nextActions.ts`). Planning a project as six
ordered steps is good practice; being shown all six while picking what to do next is not.

It is a **switch on the Tasks tab and on the Task Chooser**, not a property of a view. A view
should be a collection of settings you could have reached one at a time — the moment it also
carries a setting available nowhere else, picking the view is the only way to get the
behaviour and you cannot combine it with anything.

Two rules the implementation depends on:

- **Judge leaf-ness inside the list you were given**, not from `hasChildren`. A task whose
  subtasks this view filters out is a leaf _here_; otherwise a view can show a summary with
  nothing under it and call it a next action.
- **Group siblings by real `parentId`, not row depth.** Tasks re-bases depth so every task
  looks top-level; grouping by depth would leave one next action for the whole tab.

The Task Chooser keeps its own rule (`lib/chooser/views.ts`, manual §8.3): it is a flat scored
list with no hierarchy, so "first leaf sibling" has nothing to mean there. Same question,
different shape — which is why they are two functions and not one with a flag.

## A view is a collection of settings, never a mode

Every `View` picker entry is a set of **ordinary stored values** — column layout, grouping,
and filters — that the user could have reached one at a time. "Active Tasks" is a State filter
you can see in the chip bar, remove, and combine with anything; it is not a hidden row
predicate inside `sliceTree`.

The test: **if picking the view is the only way to get some behaviour, it is a mode.** A mode
cannot be combined, cannot be inspected, and can only be described by its own name.

- `keep` stays **structural only** — "this tab shows tasks". Which _states_ a view shows is
  its default filter (`lib/grid/stateFilters.ts` builds them the shape the funnel writes, so
  the funnel opens with the right boxes already unticked).
- **`GridSettings.filters` is nullable, and the three states are distinct**: `null` follows
  the view's defaults, `{}` is the user having cleared everything, and a map is their
  choice. Without that distinction a view could only have defaults that were impossible to
  turn off — clearing them would last until the next render. Same contract as `order` and
  `groupBy`, and `parseGridSettings` carries the v1 migration for it.
- **`Clear all` clears to nothing; `Reset this grid` restores the view's defaults.** Two
  different questions, two different controls.
- A default filter is **indistinguishable from one the user set**, on purpose: same chip,
  same funnel state, same `Clear all`. That is what makes it a setting rather than a mode.

### Saved views

Because a view is only stored settings, **saving one is copying a handful of values and giving
them a name** — which is why the "we deliberately do not do user-saved views" line is gone. Its
own condition was _revisit when the presets demonstrably do not cover it_, and the answer turned
out not to be a new feature at all.

**Every main grid has them**, through one hook: `useModuleViews`. A module declares its
built-in views, which one it opens on, and what each of those defaults to; the hook owns the
sequence — catalogue, allow-list, selection, grid state — whose **order is load-bearing**
(`useSavedViews` before `useTabView`, or every saved id is rejected as illegal and the module
silently falls back to its default). Passing its return value to `GridToolbar`'s `views` prop
is the whole integration.

- The **catalogue** lives in `views:{tabId}`; how you have since adjusted a saved view lives in
  its own `grid:{tab}.{id}` scope, exactly as a built-in view's does. `Reset this grid` returns
  to what you saved.
- A saved view captures **order, filters, grouping and switch positions**. The first three
  already distinguish "not chosen" from "chosen" (the nullable fields in `grid.ts`); switches
  need no such distinction because each is its own key — `resolveSwitches` falls back per id
  (stored → view → the tab's `defaultOn`), so there is no whole-map "cleared" state and no
  migration. Sort and density stay out: every blob carries a concrete `sorts`, so a view
  default could never win against one.
- **A view recording a switch does not make the switch a property of the view.** The rule above
  — a view may not carry behaviour reachable no other way — is intact: every switch stays on
  the toolbar, toggleable and combinable. Only its _position_ travels, as a column's
  visibility does.
- **`base` names the built-in a saved view derives from**, because some modules resolve
  behaviour and not merely defaults from the view id: `chooserView`, `parseChooserSettings` and
  `buildChooserItems` all take a `ChooserViewId`, and `saved-a1b2c3d4` is not one. `base`
  always names a built-in — saving from a saved view follows the chain through, so deleting the
  middle view cannot silently re-base the last.
- **A module's own per-view settings hang off the view id**, rather than living inside the
  view: the Task Chooser's weights in `chooser:{viewId}`, Notes' mode / sort / filter in
  `notes:{viewId}`. Achieve requires this for the Chooser (manual §8.1.4 — _"Other views will
  retain their own unique settings"_). Declare them as `viewScopes` so **saving forks them**;
  without that, naming the grid in front of you would snap the module's settings back to their
  defaults. Deleting a view clears them, as it clears the grid scope.
- **A module whose default view had no picker keeps its bare grid scope**
  (`defaultViewSharesModuleScope`). `GridSettings.view` is already nullable with null meaning
  "the module's default", so `grid:outline` _is_ that view's scope — which is what let Outline,
  Wishes and Notes gain views without orphaning a single stored column layout.
- Ids are **random, not sequential**. A reissued id would inherit the deleted view's leftover
  scopes. Deleting a view clears them with it.
- Saved ids join the built-ins in `useTabView`'s allow-list, so deleting the view you are on
  falls back instead of stranding the grid.
- **Only the select holds bar width.** Save / Update / Rename / Delete register as commands and
  live behind `⋯`, per the three-tier table below. The three that act on the selected view are
  **disabled, not absent**, on a built-in: a built-in is not yours to rename, and a command
  that vanishes teaches you it does not exist. Update needs its own feedback — it writes what
  is already on screen, so nothing visibly happens.

### The chip bar accounts for missing rows, not for stored state

Two rules follow, both of which the state filters made visible:

- A set filter stores what is **ticked**, so hiding two of nine states is stored as seven ids.
  Describe it by what is **excluded** when that list is shorter — `State: all but Completed,
Cancelled`, not `State: 7 selected`.
- A filter ticking **every value the column currently holds** draws no chip at all. It is
  hiding nothing, and `Status: 7 selected` beside `Showing 22 of 22` reads as though rows were
  held back. The chip returns the moment a ticked-off value appears in the data.

## Progressive disclosure: three rungs, in this order

| Rung | Control                                                                                                                   | For                             |
| ---- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| 1    | **Quick search** — one box, all columns, case-insensitive substring                                                       | "I know a word that's in it"    |
| 2    | **Column funnel** — set filter over values (most columns), or semantic ranges (priority); plus per-column custom criteria | Focused refinement on one field |
| 3    | **Advanced filter** — And/Or across different columns, including hidden ones                                              | Real Boolean criteria           |

All three compose with **AND**: each answers a different question and a row must satisfy
every question asked. Do not add a fourth rung before the first three are outgrown.

Keep search dumb — substring only, no operators, no field syntax, no regex. Anything more
expressive belongs on rung 3, where the expression stays visible.

### The column funnel is a set filter (with one exception)

Modelled on AG Grid's and Excel's, because that is what people already know. Most columns
get the value checklist; **priority does not** (`usesSetFilter` in `filters.ts`).

**Set-filter columns** (state, enum, text, date, …):

- **The values the column actually holds**, each with the **number of rows** carrying it, so
  you can see what a tick is worth before making it.
- **A search box over the list**, once there are more values than fit at a glance. It
  searches the **label**, not the stored value.
- **`(Select all)`** returns to showing everything. It is checked when the filter is
  inactive, indeterminate otherwise, and disabled when already showing all — a control that
  does nothing on click is worse than one that is visibly unavailable.
- **`only`** on each row narrows to that one value. Without it, isolating one value out of
  thirty means unticking twenty-nine.
- **`(Blanks)`** is an entry in the list, not a separate concept, and is omitted when no row
  is blank.
- Semantic **ranges** (deadline windows) sit below the values under their own divider when
  the kind has them. They describe a range rather than name a value, so they keep plain
  add/remove behaviour.

Two rules the selection model depends on:

- **An empty selection means every entry is ticked**, because nothing is being filtered out.
  Drawing them unticked would say the opposite of what the grid is doing.
- **Ticking the last missing entry collapses back to "unfiltered"**, never to a list naming
  every current value — such a list would silently exclude any value added later.

There is deliberately no "select none": the stored model cannot express "show no rows", and
a control that can put the grid in a state it cannot describe is worse than one without it.
That is what `only` is for.

**Priority is ranges-only.** Rank numbers are open-ended (`A1`…`A99`…), so listing every
used value is noise the presets already cover ("Only As", "As & Bs", ranked,
unprioritized, …). Exact ranks still work via **Custom criteria**. Matching still accepts
stored `value:A1` option ids if an older session saved one; the funnel just no longer
offers them.

### Filter values may be stored and displayed differently

A column filters on whatever its cell shows — the State column stores Achieve's two-letter
codes because that is what a stored filter has to keep matching. `ColumnDef.filterLabel`
maps that to something pickable (`NS` → `Not started`). **Every surface that shows a value
must use it**: the set filter, and the chips. A chip reading `NS` beside a list reading
`Not started` looks like two different filters.

## Filter state is always visible and always clearable

Two of the three controls are invisible the moment their popover closes, so the grid must
say what it is doing:

- A **chip per active condition** (`GridFilterChips`), each removing only its own condition.
- **`Showing N of M`**, where `M` is the count _before_ any narrowing — a fraction whose
  bottom half also moves says nothing about how much has been filtered out. Group headers
  are not counted; they are chrome, not results.
- One **Clear all** that clears column filters, the advanced filter and the search together.
- An empty builder is **inactive**, not "match nothing". A dialog the user opened and left
  empty must never empty the grid.

## Persistence

**Every user-visible grid preference goes into the `grid:{tabId}` scope through the single
`patch` in `useGridState` — never into component `useState`.** Column set / order / widths,
filters, advanced filter, search, sorts, group-by, group collapse, density, sub-view, and
per-tab switches.

- **One hook owns the whole scope.** A write replaces the scope's value, so two hooks each
  persisting one field would clobber each other — changing a filter would reset the column
  layout. See the header comment on `useGridState.ts`.
- **A view's defaults are `GridDefaults`**, passed to `useGridState` — the order, filters,
  grouping and switch positions a view opens with. Never a hardcoded predicate the user cannot
  see.
- **Per-tab toggles go in the open `switches` map**, declared by the tab as
  `{ id, label, defaultOn }`. A new toggle is one array entry; a removed one leaves a
  harmless orphan key rather than a parse failure. The tab supplies the default, because
  only the tab knows whether off or on is the sane start.
- **Parsing never throws and never strands a tab.** Garbage degrades to the default; a
  shape from an older build is read rather than discarded (`sort` → `sorts`, bare `string[]`
  → options filter). An explicitly empty collection is honoured — "show me nothing" is a
  legal choice.
- Tab-wide settings (`includeDeferred`) keep the **tab** scope; per-view settings keep the
  **view** scope (`grid:tasks.active-status`). Putting a per-view setting on the tab makes
  it fight whichever view you are not looking at.

## Toolbar

**Two rows: verbs above, lens below.**

`GridToolbar` renders both. Row 1 is `CommandBar` — the view's named menus, the handful of
commands promoted to icon buttons, the selection chip, the Commands panel toggle. Row 2 is the
lens: view picker, scope pickers, search, `Filter…`, `Group by`, the tab's switches, density,
with the chip bar under it.

One row held both and the result was a flat run of identically-bordered controls where `New` and
`Rename` sat between `Group by` and `Density` with nothing to say which kind of thing was which.
Zoning a single row does not survive the real width: a view picker, two scope pickers, search,
Filter, two `Group by` levels, switches and density already fill 1280px. ~28px is what the split
costs and a bar you can read in one sweep is what it buys.

Below `md` there is **one** row — the lens, panning sideways, with `⋯` pinned outside the
scroller. The verbs are all inside `⋯` there (`responsive.md`).

A tab supplies only what is its own: `commandCapabilities` (what can be done to a row),
`views`, `left` (scope pickers) and `right`.

A tab declares **what it has** — columns, switches, group dimensions, command capabilities. It
does not assemble buttons, and it does not decide which surface a command appears on: the command
declares its own `menu` / `section` / `icon` / `toolbar` / `rowMenu` and every surface reads that.
If you find yourself adding a control to one grid, add it to `GridToolbar` instead and let every
grid have it.

**And take controls back out again.** A toolbar earns its width; every button on it is one
the user has to read past to find the one they want. Two tests, both of which the grid has
failed at least once:

- **Is it a column filter wearing a checkbox?** The Outline's four type checkboxes and its
  Focus only toggle were, so they went to the `icon` / `type` and `focus` columns. A per-type
  view is what the Projects, Tasks and Goals tabs already are.
- **Are its only two states "unavailable" and "duplicated"?** `Clear filters` was disabled in
  exactly the state where the chip bar is absent, so it could only be pressed while the chip
  bar was on screen offering `Clear all`.
- **Is it an arrangement?** Then it is `groupBy`, never a toggle — the Outline's `By category`
  checkbox was a standing exception to a rule the Projects tab already followed. Folding it in
  cost one click and bought `Collapse all`, which the bespoke toggle never had.

- **Does the tab already have one?** Rename and Open were spelled out identically on four
  tabs; they are commands built from `commandCapabilities` now. `ux-principles.md` requires them
  — `F2` and `Enter` are the real bindings and a shortcut with no button fails whoever does not
  know it — but a tab should declare that it has a selection, not assemble two buttons.
- **Is a second control reporting the same number?** The Task Chooser said `20 of 47` beside
  the chip bar saying `Showing 20 of 20`, because the grid can only count the rows it was
  handed. One count, in the chip bar, with the host passing the real denominator.

Prefer a control that shows its own state to one that needs a label to say what it is:
density is a two-button segmented control (`Roomy` / `Dense`), not a `Density:` select.

### The menu tier

A control that survives those tests but is used **occasionally** does not have to hold width on
every grid on every screen forever. It goes in the menu it belongs to — `Show Fields` and
`Reset this grid` are `View ▸ Layout` — and stays off the icon row.

That demotion used to cost something, because the only tier below the bar was an unsorted `⋯`
list. A _named, sectioned_ menu is findable by reading, so a command in `View ▸ Layout` is one
click away **and** discoverable, which is what makes the tier honest.

Three tiers, and a control belongs in the lowest one that still works:

| Tier           | Test                                                                               |
| -------------- | ---------------------------------------------------------------------------------- |
| **On the bar** | Used most sessions. An icon button on the command row, or a widget on the lens row |
| **In a menu**  | A real command, used occasionally (`Show Fields`, `Convert to…`, the zooms)        |
| **Deleted**    | Fails one of the tests above                                                       |

A menu is not a place to hide things you could not justify. If a control fails the "column filter
wearing a checkbox" or "unavailable or duplicated" test, moving it into a menu does not fix it —
a menu with junk in it is read exactly as carefully as a toolbar with junk on it, which is to say
not at all.

**Commands and view controls go in different rows, always** — not "where a view has many
commands". They answer different questions ("what can I do" vs "what am I looking at") and the
rows are what say so. That rule used to be conditional and the Outline was the only view that
followed it, with a bespoke second bar; it is now `GridToolbar`'s shape for every grid.

Below `md` the toolbar is one horizontally-scrolling row, and dialogs open as sheets — see
`responsive.md`. Tap targets stay 44px; that is not covered by the accessibility exemption
in `ux-principles.md`.

## What we deliberately do not do

| Not doing                     | Why                                                                                                                                                                                                                                    |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Virtualization**            | Personal data volumes. The row layer is CSS grid plus HTML5 drag and would fight a virtualizer for no gain we can currently measure.                                                                                                   |
| **Pagination**                | Same. Pagination also breaks "scroll to the row I was just looking at", which is how these grids are actually used.                                                                                                                    |
| **Server-side sort / filter** | Everything is already in memory from one recursive CTE. Round-tripping a keystroke would be slower, not faster.                                                                                                                        |
| **Aggregation footers**       | The numbers that matter — effort, effort left, % complete — already roll up the _tree_ in `derive.ts`. A second, group-shaped sum of the same field in the same column would be a different number with no way to tell which is which. |
| **Pivoting**                  | No question anyone has asked of this data needs it.                                                                                                                                                                                    |

## Why hand-rolled, and when to revisit

Decided in `specs/2026-07-28-1121-main-grid-tabs`, re-confirmed in
`specs/2026-08-04-0924-grid-control-surface`:

- **AG Grid and MUI X Data Grid** — rejected on licensing. Tree data, row grouping and set
  filters are Pro/Premium/Enterprise in both, which is precisely the feature set wanted.
- **TanStack Table** (MIT, headless, genuinely capable) — rejected because it uses `subRows`
  for **both** tree data (`getSubRows`) and grouping (`getGroupedRowModel`), so the two are
  mutually exclusive. Every grid here needs hierarchy _and_ group headers at once. Its
  sort/filter/visibility state is also in-memory, where ours already persists to Postgres —
  adopting it means writing an adapter to arrive back where we started.

**Revisit when the grid starts accumulating _table_ logic rather than _app_ logic** — a
virtualizer, a pagination model, a server-side query builder. Until then the hand-rolled
grid is smaller than the adapter a library would need.

## Testing

Per `development/testing.md`: the logic lives in `src/lib/grid/**` and `src/lib/tree/**`
with a test beside it, and there are **no React component tests**. The pure modules worth
knowing about:

| Module                          | What it owns                                                 |
| ------------------------------- | ------------------------------------------------------------ |
| `lib/grid/sortRows.ts`          | Hierarchy-preserving multi-key sort                          |
| `lib/grid/columnMenu.ts`        | Which column-menu items are available, and header drag slots |
| `lib/grid/ancestors.ts`         | Ancestor closure that keeps a filtered tree connected        |
| `lib/tree/flattenLevels.ts`     | Dissolving a level and promoting its children                |
| `lib/tree/completionCascade.ts` | Which other nodes a state change moves, and which way        |
| `lib/grid/customFilter.ts`      | Operator vocabulary and per-column expressions               |
| `lib/grid/crossFilter.ts`       | Cross-column And/Or advanced filter                          |
| `lib/grid/search.ts`            | Quick search matching                                        |
| `lib/grid/chips.ts`             | What the chip bar says                                       |
| `lib/grid/distinct.ts`          | Distinct values, shared by funnel and builder                |
| `lib/settings/grid.ts`          | The persisted shape, its defaults and its migrations         |
| `lib/tree/slice.ts`             | Row slice, group dimensions and header counts                |

A test earns its place if it would fail on a plausible mistake. The mistakes this area
actually makes are: a filter that silently matches nothing, a sort that lifts a child above
its parent, a count that does not match the rows beside it, and a stored blob that strands a
tab after an upgrade. Test those.

---

## components/responsive.md

# Responsive & Touch

> For the philosophy these rules serve, see `ux-principles.md`. For how the drawer and
> dialogs reshape below `md`, see `drawer-pattern.md` and `modal-pattern.md`.

The app is a desktop instrument first: a dense grid, a right drawer, and a keyboard. It also
has to work on a phone, because `agent-os/product/mission.md` promises "reachable from phone,
tablet, and any OS" and the app is installable as a PWA.

Those two things are not the same layout at two sizes.

## The core rule: adaptive, not shrunken

A 28px row with six columns does not become usable by getting narrower. Below the breakpoint
the app presents **a different information architecture over the same data**:

| Desktop                        | Phone                                   | Why                                                          |
| ------------------------------ | --------------------------------------- | ------------------------------------------------------------ |
| Grid + right drawer            | List → full-screen sheet                | Context preservation is cheap on 1440px, impossible on 390px |
| Grouped sidebar (collapsible)  | Bottom nav + More sheet                 | A 48px icon rail on a 390px screen is the shrunken answer    |
| `⌘K` command palette           | `⋯` on the view's toolbar               | There is no `⌘K` on touch — see `navigation.md`              |
| Multi-column panes, side rails | One column, segmented control to switch | Horizontal scrolling is a failure state                      |
| Hover reveals, double-click    | Persistent affordances, single tap      | There is no hover on touch                                   |
| Right-click menu               | Long-press menu                         | There is no right button                                     |
| Keyboard shortcuts             | Bottom nav, buttons, a capture FAB      | The keyboard is secondary and covers half the screen         |
| Sticky column headers          | Sticky section headers                  | There are no columns to head                                 |
| Drag to reorder                | An explicit "Move to…" action           | See **Drag is mouse-shaped**, below                          |

If a view cannot be re-thought this way for a reasonable cost, it degrades gracefully — it
scrolls horizontally inside its own container and says so. It does not get squashed.

## One breakpoint carries the weight

**`md` — 48rem / 768px.** Below it is _compact_: phones, and iPad in portrait. At and above it
is _the instrument_: the full grid, the right drawer, the sidebar, the keyboard model.

- Use `md:` for anything structural. `sm:` is for minor reflow inside an already-compact
  layout (a two-up field row becoming one-up).
- **Do not invent per-component breakpoints.** A component that needs its own is usually a
  component that should be branching on `useIsCompact()` instead.
- In JS, branch with `useIsCompact()` (`src/components/shell/useIsCompact.ts`), which reads the
  same 48rem line through `matchMedia`. Never read `window.innerWidth` directly, and never
  branch on a user-agent string.
- The server snapshot of `useIsCompact()` is `false`, so SSR renders the desktop layout and
  hydration swaps. Every page is `force-dynamic`, so there is no cached-HTML mismatch.

## Touch targets

**44 × 44 px minimum** below `md` (Apple HIG). Use `--tap-target` (`2.75rem`), not a
hand-picked height.

The desktop UI is full of controls far below this, and they are correct there — they are simply
not reusable in a compact layout:

| Control                   | Desktop size | Where              |
| ------------------------- | ------------ | ------------------ |
| Grid row                  | 28px         | `--row-height`     |
| Expand / collapse chevron | 16px         | `cells.tsx`        |
| Column filter funnel      | ~10px        | `ColumnHeader.tsx` |
| Column resize handle      | 4 × 16px     | `ColumnHeader.tsx` |
| Focus checkbox            | 14px         | `cells.tsx`        |

Where a compact layout needs the same action, it gets a new control at tap size — it does not
scale the desktop one up by a few pixels.

Spacing matters as much as size: two 44px targets touching each other still produce mis-taps.
Leave real gaps between adjacent interactive elements in a list.

## The 16px input rule

**Every focusable `input`, `select` and `textarea` renders at ≥16px below `md`.** This is not a
typography preference. iOS Safari zooms the viewport when you focus a control smaller than
16px, and it does not zoom back out when you blur — one tap on a 13px cell editor and the rest
of the session is scrolled sideways.

The app's base size is `text-[0.8125rem]` (13px), so this is handled centrally in
`globals.css` rather than per component:

```css
@media (max-width: 47.999rem) {
  input,
  select,
  textarea {
    font-size: 1rem;
  }
}
```

Do not override it back down with a utility class on an individual field.

Body copy should be ≥16px on phone for the same readability reason, but that one is a
preference; the input rule is a hard constraint.

## Safe areas and the viewport

The iPhone has a notch/Dynamic Island at the top and a home indicator at the bottom, and in an
installed PWA there is no browser chrome absorbing them.

- `viewport-fit=cover` is set once, in the `viewport` export in `src/app/layout.tsx`. Never add
  a raw `<meta name="viewport">` — Next owns that tag.
- Anything pinned to a viewport edge (the bottom nav, a sticky drawer footer, a compact header)
  pads with the `.pt-safe` / `.pb-safe` / `.px-safe` utilities in `globals.css`. Do not write
  `env(safe-area-inset-*)` inline; a value that appears in three files will drift in two.
- **Never `100vh`.** iOS reports the _large_ viewport for `vh`, so a `100vh` element sits partly
  under Safari's toolbars. Use `dvh` (or `svh` where content must never be clipped).
- The shell keeps `body { overflow: hidden }` and the `h-full` flex chain
  (`html` → `body` → page → `min-h-0 flex-1 overflow-auto` scroller). The scroll container is
  always an inner element, never the page. Add `overscroll-behavior: none` on the shell so a
  scroll that reaches the end does not rubber-band the whole app.
- The soft keyboard is handled by `interactiveWidget: "resizes-content"`, which shrinks the
  layout viewport so a sticky footer stays above the keyboard. Reach for `visualViewport` only
  if a specific surface still misbehaves.

## Touch gestures

| Gesture        | Meaning below `md`                  | Desktop equivalent |
| -------------- | ----------------------------------- | ------------------ |
| Single tap     | Open the record                     | Double-click       |
| Long press     | Row context menu, as a bottom sheet | Right-click        |
| Swipe on a row | One reversible action per direction | (none)             |

Rules:

- **Nothing is reachable only by hover, only by right-click, only by double-click, or only by a
  keyboard shortcut.** This generalises `modal-pattern.md`'s "a visible button always
  accompanies a keyboard shortcut." Before shipping a compact layout, list every action the
  desktop view offers and confirm each has a tappable path. The commands most likely to be
  missed are the ones that exist _only_ in a right-click menu.
- **Swipe is for reversible actions only** — complete, reschedule, archive. Never delete
  without a confirmation, and never bind a swipe to something with no undo.
- **A swipe must not fight the scroll.** Lock to the horizontal axis only after the pointer has
  moved further horizontally than vertically past a threshold; until then, let the list scroll.
- Long-press and swipe thresholds are **pure logic and live in `src/lib/touch/`** with tests
  (`development/testing.md`) — an off-by-one in a slop threshold is invisible until it is
  infuriating.

### Drag is mouse-shaped

HTML5 drag-and-drop is the reorder mechanism on desktop, and `DataGrid` arms `draggable` on
`onMouseDown` so a drag does not steal text selection inside cell editors. `onMouseDown` does
not reliably precede a touch drag, so **drag-to-reorder is disabled below `md`**, deliberately.

Any ranking or reparenting that drag provides on desktop must also exist as an explicit command
in the long-press menu ("Move to A/B/C/D", "Move up", "Indent"). Do not add a touch-drag
polyfill to preserve the gesture; add the command.

## Dark mode

Dark mode is first-class and stays driven by `prefers-color-scheme` in `globals.css`. There is
no theme toggle and no `data-theme` attribute; adding one is a product decision, not a styling
one.

Every new surface is checked in both schemes. Hard-coded light values exist today — the
`.schedule-calendar` gold column headers and white event cards — and they are a known,
contained exception, not a pattern to copy.

## Overflow

The page body never scrolls horizontally. Wide content — a data grid, a wide table, a code
block, a 7-day calendar — scrolls **inside its own `overflow-x: auto` container**. A view that
genuinely cannot work narrow says so in one line rather than silently clipping.

## Verification checklist

There are no component tests (`development/testing.md`), so this is the gate. Check any surface
you touched at **390 × 844** (iPhone 12) before calling it done:

1. No horizontal scroll on the page body, in portrait and landscape.
2. Tap every interactive element — none below 44px, none needing a second precise tap.
3. **Focus a text input and confirm the page does not zoom.**
4. Open the soft keyboard: sticky footers and add-rows stay above it.
5. Bottom-pinned chrome clears the home indicator; top chrome clears the notch.
6. Every desktop action on the view has a tap path (walk the right-click and shortcut lists).
7. Both colour schemes.
8. The installed PWA, not just Safari — standalone has no browser chrome to hide behind.
9. **Then re-check the view at 1280 × 800.** Compact work regresses desktop density more often
   than the reverse.

---

## components/ux-principles.md

# UI/UX Design Principles

The design philosophy behind our component patterns. Read this before the
implementation-focused standards (`drawer-pattern.md`) — it explains _why_ those patterns
exist.

Adapted from the same standard in Lee's `wrcs/reactwrcs` project, where these principles
emerged from iterating through grid → tabs → modals → grid+drawer during 2025–2026. They
align with patterns used in Linear, Supabase, Retool, and other modern tools. Where this
document differs from the original, it is because Achieve Planner's model differs — see
**Tabs** below.

## Core Principles

- **Context preservation** — never hide the outline unless absolutely necessary. It is the
  user's map of everything they have committed to; losing sight of it is disorienting.
- **Consistency** — the same patterns across every view, and aligned with conventions users
  already know from elsewhere.
- **Clarity over cleverness** — if users have to guess how to do something, the design has
  already failed.
- **Error prevention > error recovery** — make dangerous or irreversible actions hard to do
  by accident.
- **Progressive disclosure** — show only what's needed now; hide complexity until relevant.
- **Immediate, clear feedback** for every action.
- **Keyboard first on desktop, touch-complete on phone** — this app replaces a keyboard-driven
  Windows tool. At `md` and above, anything reachable by mouse should be reachable by key, and
  the primary workflows should be faster by keyboard than by mouse. Below `md` that inverts:
  every action must have a visible, tappable path, because there is no keyboard, no hover and
  no right button. Neither half is optional — a shortcut with no button fails on the phone, and
  a button with no shortcut fails at the desk. See `responsive.md`.
- **Accessibility is not a goal here** — one user, no screen reader, not public. Skip ARIA
  coverage, contrast ratios and screen-reader testing; add them if this is ever released.
  Keep the handful of roles and labels that are load-bearing for other reasons (see
  `modal-pattern.md`) — they are wiring, not compliance.
  **Hit-target size and touch-reachability are not covered by this exemption.** A 44px tap
  target and a tappable path to every command are usability for the one user we have, on the
  phone he actually owns — not compliance for a hypothetical audience.
- **Performance is UX** — slow expand/collapse or heavy re-renders destroy usability in a
  dense grid.
- **Forgiveness & safety** — let users recover easily; never force inaccurate data entry.

## Layout & Navigation

### Getting between views, and finding commands

A grouped, collapsible **sidebar** for where you can go; a `⌘K` **palette** for what the app
can do; a **`⋯` overflow** on each view's toolbar so no command is reachable by shortcut
alone. Views and commands each live in exactly one registry. Full rules, including why a
palette-only command is not shipped: **`navigation.md`**.

### Grid + drawer is the default

The **outline grid + right-sliding drawer** is the standard pattern for list + form work
(see `drawer-pattern.md`):

- **Grid** for scanning, filtering, reordering, and fast inline edits
- **Drawer** for the full record — the grid stays visible, preserving context

Below `md` this becomes **list + full-screen sheet**. Context preservation is the principle the
drawer serves, and on a 390px screen it is unaffordable — there is no room to keep the grid
visible and still show a form worth filling in. The compact layout gives up that principle
knowingly, in the one place where the alternative is worse. Everything else on this page still
applies. See `responsive.md`.

### Inline editing for grid-visible fields

Fields that appear as grid columns — name, priority, effort, deadline, state, focus — are
edited **in place**. Opening a drawer to change a priority would be absurd. The drawer is
for the fields that don't fit on a row.

Where a value is a rollup of its descendants (a parent's effort), the cell is **read-only**.
Never offer an editor whose result would be invisible behind a computed value.

### Sorted grids: do not move the world while the user is still typing

**Context preservation applies inside a grid row too.** If the user is mid-edit, the row
must stay put. Re-sorting (or re-filtering) the moment a sort-key column changes under the
cursor is classic poor UX: they lose their place, can't finish the value, and the interface
feels hostile.

Rules:

1. **Commit on finish, not on every intermediate change.**  
   Buffer the editor in local state. Write to the model on **blur**, **Enter**, or an
   explicit Accept — not on each keystroke and not on each partial date-picker step.
2. **Defer re-sort until the edit session ends.**  
   While any cell in the sorted grid (or tracking table) has focus, freeze the on-screen
   row order. After focus leaves the grid, re-apply sort. Optional later polish: animate
   the row to its new place or offer a manual “Re-sort” control; never jump mid-edit.
3. **Date pickers: month/year navigation is not a commit.**  
   Changing month or year is exploratory. Only a complete day selection, Accept, or blur
   of a finished value should update storage. With native `type="date"`, treat `onChange`
   as draft-only and commit on blur — do not fire a server write that reloads and re-sorts
   the list while the calendar is still open.
4. **Same for other multi-step editors** (decimal fields, composite values): draft locally,
   commit when the user is done (see Metric tracking value/date cells).

| Action while editing a sorted column | Good                                    | Bad                                   |
| ------------------------------------ | --------------------------------------- | ------------------------------------- |
| Open date picker / change month      | Calendar navigates; no write; row stays | Picker closes, value saves, row jumps |
| Key into a value cell                | Local draft only                        | Every keystroke re-sorts              |
| Blur / Enter after a real change     | Commit, then re-sort when focus leaves  | Already sorted three steps ago        |

This is the same principle as the drawer: **do not hide or rearrange the user's map while
they are working on a piece of it.**

### Avoid modals for routine editing

Modals hide context, increase cognitive load, and feel interruptive. Reserve them for:

- **Destructive confirmations** — "Delete this project and everything under it?"
- **Critical blocking actions** where the user _must_ decide before continuing
- **Fast capture** — a transient, keyboard-invoked surface that owns no record

Never use a modal for a standard create/edit flow.

#### The capture exception

Quick capture (`QuickCaptureDialog`) is a modal on what looks like a create flow, and is
still right. The discriminator is **whether context preservation is wanted**:

|                      | Standard create/edit | Fast capture            |
| -------------------- | -------------------- | ----------------------- |
| Purpose              | Full record editing  | Get it out of your head |
| Context preservation | High                 | **Low, intentionally**  |
| Bound to a record    | Yes                  | No — nothing exists yet |
| Bulk / freeform text | No                   | Yes                     |
| Pattern              | Drawer               | Modal                   |

The rule protects your view of the outline while you work _on_ something in it. During
capture the outline is irrelevant by definition — the thought arrived from somewhere else,
and the faster the app gets out of the way the better it has done its job. A drawer would
also be slower to open, slower to dismiss, and would imply a record relationship that does
not exist.

**This does not license** a modal for anything with an id: editing a node, a note, or an
appointment stays in a drawer. If you would return to it and edit it again, it is not
capture. Keep a capture surface extremely lean, so it reads as a tool rather than a form.

**This is the main place we depart from Achieve Planner.** Achieve opens a modal for
everything, and routinely opens modals on top of modals. That is the part of its design
worth leaving behind — the workflow it encodes is excellent; the containers it uses are not.

`ConfirmDialog` in `src/components/detail/` serves the first two cases — the outline's delete
flow and the drawer's unsaved-changes prompt; use it rather than `window.confirm`. Every
centered dialog, including those, is built on `ModalShell`. See `modal-pattern.md`.

The stacked-modal rule bites hardest in the repeating lists inside a detail form — Achieve
opens a second modal to edit an Objective or a Risk. We expand the row in place instead
(`ItemList`).

### Tabs organise sections within a form

Tabs are the **correct** pattern for grouping sections of a complex record form, and this
app uses them exactly as Achieve does — a Project or Result Area opens with its fields
grouped across several tabs.

The original version of this standard argued against tabs. That argument was aimed at using
tabs to represent **individual data items** — one tab per record — which was a quirk of that
app's earlier design and is not something we do. It was never an argument against tabs as a
way to organise sections of a single form.

The distinction that matters:

| Tabs for…                     | Verdict                             |
| ----------------------------- | ----------------------------------- |
| Sections of one record's form | **Correct.** Use them.              |
| One tab per data item         | Wrong. That's what the grid is for. |

## Editing Triggers

Prefer explicit, discoverable actions over hidden gestures, and standardise whichever
trigger is chosen across every view — users should never have to relearn how to open a
record.

The bindings, which every view must match:

| Gesture                  | Opens                                          |
| ------------------------ | ---------------------------------------------- |
| `Enter`, or double-click | The full record, in a drawer — as Achieve does |
| `F2`                     | Inline name editing, the Windows convention    |

Both also appear as toolbar buttons, and the selected row carries a small open-record
affordance — a gesture nobody can see is not a discoverable action.

Below `md`, **single tap** opens the record and **long press** opens the row menu. Double-click
and right-click do not exist on touch, so these are translations of the same bindings rather
than a second set to learn. `F2` has no compact equivalent — inline rename happens in the
sheet. See `responsive.md`.

## Forms & Validation

### Minimise required fields

Only hard-require what is genuinely essential. Ask: "can the system function without this
right now?" If yes, make it optional. In this app almost nothing is truly required — a node
needs a type and a place in the tree; even the name can be filled in later.

### Allow partial saves

Let users save incomplete records. Forcing completeness produces junk data, lost work, and
abandonment — people frequently know a task exists before they know how long it will take.

### Use drawers for complex forms

For forms with many fields, conditional sections, or dropdowns needing room to expand, use
the drawer. Never cram them into grid cells.

### Save stays open; leave is separate

A drawer is a workspace, not a one-shot dialog. For structured record forms (node detail,
appointments) without autosave, commit and leave are independent. Use the shared
`DrawerFooter` — never invent a different button set:

```
[ Cancel ]                          [ Save ]   [ Save & Close ]
```

- **Save** (outlined) commits and **stays open**, with "Saved" / "Unsaved changes" feedback
  (⌘/Ctrl+S).
- **Save & Close** (solid primary, rightmost) commits then leaves (⌘/Ctrl+Enter); failed
  saves stay open.
- **Cancel** (ghost, left) / header × / Escape leave the drawer; if dirty, confirm discard.

Do not make a single Save that always closes — that forces reopen thrashing across tabs.
Do not ship only stay-open Save either: finishing an edit then becomes Save + Cancel every
time. Document-like surfaces (notes, session log) **autosave** instead; short nested
sub-editors may treat Save as done (Cancel + Save only). Details live in
`drawer-pattern.md`.

### Inline validation

- Validate **on blur**, not while typing.
- Error messages must be **specific and actionable** — "Effort must look like 2 h, 45 min,
  or 3:45 h", not "Invalid input".
- Clear the error state as soon as the user corrects it.
- Keep **Save** available unless a submit is in progress; show blocking errors on the save
  attempt rather than disabling the button.
- Unparseable input in a grid cell **reverts to the stored value and flags the cell** rather
  than saving something wrong or silently clearing it.
  Validation here is light by design (see partial saves); it is still not a reason to close
  on Save — stay open so a rare failure can be fixed in place.

## Decision Guide

| Question                                                                         | If yes →                                    | If no →                                          |
| -------------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------ |
| Is the field already a grid column?                                              | Edit inline                                 | Drawer                                           |
| Is the value a rollup of descendants?                                            | Read-only                                   | Editable                                         |
| Are there more than 3–4 fields to edit at once?                                  | Drawer (not modal, not inline)              | Inline is fine                                   |
| Does the form have distinct groups of fields?                                    | Tabs within the drawer                      | A single scrolling pane                          |
| Is this destructive or irreversible?                                             | Confirmation dialog                         | Just do it, with clear feedback                  |
| Does it edit a record that already exists?                                       | Drawer, never a modal                       | A modal may be right — see the capture exception |
| Does the user need the outline visible while editing?                            | Drawer                                      | Drawer is still fine                             |
| Is this long-form writing with little to validate?                               | Autosave drawer                             | Explicit Save / Save & Close footer              |
| Is this a short nested "return a value" editor?                                  | Save may close (exception)                  | Save stays open; Save & Close finishes           |
| Is the viewport below `md`?                                                      | List + full-screen sheet                    | Grid + right drawer                              |
| Is the action only reachable by hover / right-click / double-click / a shortcut? | It is broken on touch — add a tappable path | Ship it                                          |
| Does editing this cell change the active sort key?                               | Draft locally; freeze order until blur      | Never live re-sort under the cursor              |
| Is this a multi-step control (date picker, decimal, composite)?                  | Commit on blur / Enter / Accept             | Do not write on intermediate steps               |

---

## development/testing.md

# Testing

This is a personal project with one developer and no users to page at 3am. Tests here are
not a quality ritual and not a coverage target — they are a **tripwire**. Their job is to
notice when something quietly stops working: a refactor that drops a `userId` from a
`where` clause, a date helper that shifts by an hour across DST, an agent that "fixes" a
bug by deleting the guard that caught it.

That purpose sets the bar. A test earns its place if it would **fail loudly on a plausible
mistake**. If breaking the code would not break the test, the test is decoration.

## What gets tested

**Pure logic in `src/lib/**` — always.** Recurrence expansion, sort keys, tree slicing,
date geometry, filters. These are cheap to test, hold the trickiest reasoning in the
codebase, and are exactly where a wrong answer looks plausible. Adjacent `foo.test.ts`.

**Database mutations and queries — always, as `*.integration.test.ts`.** Every one of these
takes a `userId` and is expected to scope by it. Prove it: a mutation suite is not done
until it has a case where **a second user tries to read, change, and delete the first
user's row and fails at every step**. A dropped `userId` is one of the easiest mistakes to
make and is completely invisible when you only ever test with one user.

**React components — no.** There is no testing-library setup and adding one is not
currently worth it. The bug class that actually bit this codebase in components was
unhandled promise rejections, and that is caught by the type-aware ESLint rules
(`no-floating-promises`, `no-misused-promises`) far more cheaply than by rendering tests.
If a component grows real logic, extract it to `src/lib/**` and test it there.

**Server actions in `src/app/**/actions.ts` — no.** They are thin wrappers that resolve
the user and delegate. Test what they delegate to.

## What a good test looks like here

- **Name the invariant, not the mechanics.** `"does not let one user rename another's
chart"` survives a rewrite. `"calls db.update with the right args"` does not.
- **Pin behaviour that is easy to get subtly wrong**, and say why in a comment when the
  expected value is non-obvious — DST boundaries, end-of-month clamping, inclusive vs
  exclusive range ends, "end after N occurrences" when the window starts later.
- **Prefer real values over mocks.** Integration tests use the real Postgres from
  `npm run db:up`, each under a freshly created user, cleaned up in `afterAll`. Do not mock
  Drizzle — a mocked query proves nothing about the query.
- **Cover the boundary, not every value.** One test for "interval 0 floors to 1" beats six
  tests for intervals 1 through 6.

## What not to write

- Snapshot tests. They pass whatever the code does, which is the opposite of a tripwire.
- Tests that restate the implementation line by line. When the code changes they change
  with it and never catch anything.
- Tests for framework or library behaviour. Drizzle and Vitest are already tested.
- Tests for trivial pass-throughs, getters, or type-only modules.

## When adding a feature

1. Put the real logic in `src/lib/**`, not in the component.
2. Write the pure tests alongside it. If the logic branches on dates, include a DST or
   month-boundary case. Calendar fixtures use **`fromDateKey("2026-08-01")`** and assert
   with **`toDateKey`** — never `new Date("2026-08-01")`, never `getHours() === 0` (stored
   as UTC noon). Keep the Aug 1→Jul 31 regression covered — see `development/dates.md`.
3. If it touches the database, add an `*.integration.test.ts` — including the cross-user
   case.
4. Run `npm test`. The pre-commit hook runs the unit tests and pre-push runs everything,
   but do not make the hook the first time you find out.

## Mechanics

|                        |                                                                   |
| ---------------------- | ----------------------------------------------------------------- |
| Unit tests             | `foo.test.ts` beside `foo.ts`, no database, must stay hermetic    |
| Integration tests      | `foo.integration.test.ts`, real Postgres, one fresh user per test |
| Run everything         | `npm test`                                                        |
| Run only the fast ones | `npm run test:unit`                                               |

Integration tests **skip loudly** when Postgres is unreachable, so a stopped container
never blocks a commit — see `src/lib/testing/database.ts`. That means a green
`npm run test:unit` does **not** mean the database logic passed. Check for the skip
warning before trusting a green run on a change that touched `src/lib/**/mutations.ts` or
`queries.ts`.
