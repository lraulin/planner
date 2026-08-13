# Navigation & Commands

> For the philosophy these rules serve, see `ux-principles.md`. For how each surface
> reshapes below the breakpoint, see `responsive.md`.

Achieve Planner reached all sixteen of its views through the **Go** menu, and kept only the
ones you had opened as tabs. We inherited the tabs without the Go menu, so every view had to
be a permanent tab and the eleventh was already too many.

Six surfaces now, each answering a different question.

| Surface                      | Question it answers              | Where                           |
| ---------------------------- | -------------------------------- | ------------------------------- |
| **Sidebar** (`⌘K` to search) | "Where can I go?"                | Desktop, always                 |
| **Page bar**                 | "Where else can I go _in here_?" | Above the toolbar, both layouts |
| **Menu bar**                 | "What can I do here?"            | Every view's command row        |
| **Commands panel**           | "…show me all of it at once"     | Desktop, opt-in, remembered     |
| **Row context menu**         | "What can I do to _this_ row?"   | Right-click / long-press a row  |
| **Command palette** (`⌘K`)   | "What can this app do?"          | Desktop, on demand              |

Below `md` the sidebar is replaced by the bottom nav plus the More sheet, there is no palette and
no command row, and no panel — **`⋯` becomes the menu bar**, rendering the same tree with the
section names as headings. See `responsive.md`.

Achieve had four of these six (menu bar, icon toolbars, the docked **Outline Commands** pane, and
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

## Pages live in one registry too

Three words, three different things, and they are not interchangeable:

| Word       | Means                                                       | Registry                  |
| ---------- | ----------------------------------------------------------- | ------------------------- |
| **Module** | A sidebar destination — Tasks, Fitness, Schedule            | `shell/modules.ts`        |
| **Page**   | A destination _within_ a module — Sessions, Journal, Agenda | `lib/navigation/pages.ts` |
| **View**   | A saved collection of filter / column / sort settings       | `lib/settings/views.ts`   |

A fourth word, **pane**, is a layout region that collapses below `md` (Day's appointments /
list / journal). It is responsive layout, not navigation, and does not belong in any registry.

**"Lens" names exactly one thing: `TabToolbar`'s second row.** It is a useful name for the row
that answers "what am I looking at" — view picker, search, filter, grouping, density — and it
stops being useful the moment an individual control is also called a lens, which is how two
separate page switchers came to be documented as "lens controls" while sitting one tier above
everything else on that row. The row is the lens; the things on it have their own names.

**View is not renamed.** It is Achieve's own word for a saved column/filter preset, it is in
`data-grid.md` and every grid call site, and "lens" as a synonym for it buys nothing.

`pages.ts` is keyed by module id and holds no icons — the bar is text — which is what lets it
live in `src/lib` and be tested. `modules.ts` owns the accessors (`modulePages`,
`moduleHasPageBar`, `moduleDefaultPageHref`) and asserts at compile time that every id keying
the page registry is a real module.

**Everything the module registry promises, the page registry promises.** One list, read by the
bar, the palette's go-to entries and the bare-path redirect. `status: "reserved"` means renders
nowhere and is not a target. A reserved page is not drawn as a disabled tab.

### The control depends on the question, not the module

> **Underline tabs are navigation. Bordered segments are a setting with two or three values.**

This is the whole rule, and it was written after four modules answered "how do I reach the other
thing in here" four different ways: Fitness with a bordered segment in one style, Schedule and
Notes with a bordered segment in another, Day with a bare pair of links. Consistency here does
**not** mean one control for every switcher — that is exactly how `Sessions | Exercises` came to
look like a density picker. It means one control per question, drawn identically everywhere.

Density keeps its bordered segment. Every navigation switcher is a tab.

### The bar gets its own row, and only when it earns one

Above the toolbar, below the phone header. Not folded into the command row: navigation sits at
the rank of the sidebar, and putting it among the verbs is the flattening `TabToolbar`'s two-row
split already exists to prevent, one tier up.

It renders **only at two or more built pages**. A single tab spends a row saying "you are in the
only place there is", so most modules — and Finances, until Insights lands — pay nothing.

Below `md` the page bar is the row that survives. The command row is hidden down there, so the
bar is the _only_ path to a sibling page: it scrolls sideways and its tabs are 44px.

### A page is a URL

Real `<Link>`s to real routes, so Back works, reload holds, and a page opens in a new tab. Two
of these were persisted settings that never touched the address bar, and promoting them cost
nothing: the stickiness that motivated the setting is preserved separately by the bare module
path redirecting to `shell.lastPage`.

The query string is carried across a page switch, because the query is _where you are looking_
and the page is _how it is drawn_ — flipping Calendar → Agenda must not discard the week you
scrolled to. Each page validates its own params, so one the destination cannot use is ignored.

### A focused flow is not a page

`/schedule/plan`, `/fitness/log`, `/schedule/time-chart/[id]` and the editors never appear in
the bar. The test: **in the bar you leave by tapping a sibling; a focused flow has an exit.**

This is enforced by how the active page is resolved, and the rule is neither of the two you
would reach for first. **A declared segment matches its own subtree; anything undeclared matches
nothing.**

- `/fitness/sessions/abc` is the session editor, rendered _inside_ the Sessions page. Exact
  matching would drop the bar and the editor would look like it had left the module.
- `/schedule/time-chart/abc` is a focused flow. "First segment after the module" would invent a
  page for it.

Both wrong answers fail silently on a real route, which is why `pageForPathname` is tested and
the bar is not.

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

**The reason has to be the specific one.** "Paste" greyed with no `title` is indistinguishable
from a broken menu, and there are five separate reasons a paste can be refused. Where a helper
computes the refusal, it returns _the sentence_, not a boolean — `pasteRefusal` and
`GridSelectionCapability.moveReason` are both that shape, and both exist because the generic
sentence sent people looking at the wrong thing.

### A family folds behind one row

A section named in `NESTED_SECTIONS` renders as a single row with a fly-out (desktop) or a
drill-in with a Back row (touch), on **every** surface that shows it — the row menu and the menu
bar alike. Nesting a family on one and not the other is two shapes for one thing.

Which families fold is declared, not derived from how many rows they happen to have: `Convert to`
has five entries on the Outline and two on a flat grid, and a length rule would nest it in one
view and not the next. The single length condition is a floor of **two** — a fly-out onto one row
is a hover you have to perform to learn there was nothing behind it.

Fold the families where the _name_ is the useful thing and the members are a value picker: which
kind, which letter, which state, which level. Do **not** fold the verbs someone opened the menu
for. `Item`, `Move` and `Danger` stay flat, because burying `Delete` one hover deep is hiding it
rather than organizing it.

### Right-click reaches more than rows

Three targets, all built from `Command`s and rendered by `menuItemsFor`:

| Target                             | Menu                                                                                          |
| ---------------------------------- | --------------------------------------------------------------------------------------------- |
| **A row**                          | `rowMenuFor(capabilities)` — the registry's `rowMenu` commands, for the row under the pointer |
| **Blank grid space**               | The same menu with **no selection**: item verbs greyed with their reason, creation live       |
| **A calendar slot or appointment** | The week's own verbs, resolved by hit-testing the point                                       |

The blank-area menu is deliberately not a second, shorter list. It is the row menu with `rowId`
`null`, which is why it cannot drift from the row menu — and why `New` is on the row menu at all:
without one live command, right-clicking an empty grid opens a menu of dead entries.

A menu is **rebuilt on open**, never read from the registered command list. Right-clicking an
unselected row selects it in the same event, so the registration still describes the previous
selection at the moment the menu appears.

### Plural where the verb is plural

Delete, the state changes and Cut act on the whole selection and print its size (`Delete (3)`).
Open, Rename, Indent, Outdent and Convert stay singular — opening three drawers is not a thing.

Two things must hold before a command may act on a selection, and neither is free:

1. **The selection is the rows on screen.** `DataGrid` reports them (`onNavigableIdsChange`); a
   host must not derive them from the rows it passed _in_, which is the list before the grid's
   own filters and search narrow it.
2. **The list is reduced to roots** (`selectionMoveRoots`). A child selected alongside its parent
   is already inside that parent's branch; acting on both does it twice and counts it twice.

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
