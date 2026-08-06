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
