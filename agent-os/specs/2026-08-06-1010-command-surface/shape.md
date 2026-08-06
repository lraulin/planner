# Command Surface — Shaping Notes

**Status: frozen / complete (2026-08-06)**

## Product intent

Achieve was a Win32 app with a menu bar, two icon toolbars, a docked **Outline Commands** task
pane, and a sectioned right-click menu. Reproducing that arrangement literally would be wrong;
reproducing its _organization_ is the point. A user should be able to answer "what can I do here?"
by reading, not by remembering — and a power user should never have to leave the keyboard.

The surface has one job the old one failed at: **make the shape of the command set visible.** Four
named menus with headings inside them say "this app has creation, item actions, restructuring, and
view control" before a single menu is opened. A row of eleven identical bordered words says
nothing.

## Scope

- A menu-first command model: `menu`, `section`, `icon`, `toolbar`, `rowMenu`, `binding` on the
  shared `Command`, with pure tree/toolbar/row-menu builders and their tests.
- A hand-drawn command icon vocabulary on the existing `navIcons` `BASE`.
- Sectioned, icon-gutter menus in `ContextMenu` (extracted as `MenuList`, shared with
  `ColumnMenu`); a `MenuButton`; a `CommandMenuBar`.
- Two toolbar rows: verbs (`CommandBar`) above the lens.
- A pinnable, per-user-remembered **Commands** panel in the sidebar's visual language.
- `toolbarSegments`: the command row's hairline clusters, derived from each command's weight decade.
- Row menus derived from the registry across all eight views.
- One keyboard dispatcher, with the printed shortcut derived from the real binding.
- Metrics, Fitness, Day and Schedule brought onto the shared surface.
- `navigation.md` and `data-grid.md` updated to describe what was built.

### Out of scope

- Row-menu **content** expansion — new command families and submenus (`Insert ▸`). That is the
  next spec, and it exists because this one gives it a single place to add to.
- Draggable / dockable / floating toolbars. Achieve had them; CSS docking is fiddly, users no
  longer expect spatial freedom in a web app, and fixed-primary plus contextual plus the palette
  covers the value. Explicitly not planned.
- A user-customisable Quick Access Toolbar (pin/reorder your own commands). Plausible follow-on,
  not this slice.
- A ribbon. Considered and rejected: a contextual band costs ~64px of vertical height on every
  grid forever, and vertical space is what a datagrid app spends rows on.
- Any change to grid data, filtering, sorting, grouping or views semantics.
- A light/dark toggle, new fonts, or any other app-wide restyle.

## Decisions

- **Menu bar plus optional panel**, not a ribbon and not a permanent pane. Menus are always
  present and cost one thin row; the panel is opt-in for people who want everything visible, and
  is the closest thing to Achieve's task pane.
- **Verbs above lens**, two rows. Considered one strongly-zoned row: at 1280px with a view picker,
  two scope selects, search, Filter, Group by, Density and switches, the zones still collide and
  wrap unpredictably. ~28px is the honest price of a bar that can be read in one sweep.
- **Icons, drawn not imported.** The nav's 20 glyphs already prove the house style; ~16 more at
  `strokeWidth 1.5` on the shared `BASE` keeps the two rails reading as one system and adds no
  dependency.
- **`⋯` survives only below `md`,** where it becomes the phone's menu bar and renders the same
  sectioned tree. Desktop gets real menus, so an overflow button there would be a third way to
  say the same thing.
- **`toolbarGroup` / `primary` / `hasOwnControl` retire.** `toolbar` (a sort weight) subsumes the
  first two; `ownControl` survives, narrowed to its real meaning — this command's visible control
  is a non-command widget on the lens row (Filter, Group by, Density, search), so the menus should
  list it without claiming to own its button.
- **`Command.shortcut` becomes derived.** `binding` is the truth and `formatBinding` prints it. A
  shortcut typed as a string next to a binding written in a `switch` is two descriptions of one
  fact, which is the exact failure mode `navigation.md` already names for labels.
- **Selection movement stays in the views.** Arrow keys and shift-extend are navigation over a row
  set, not commands with a menu entry; moving them into the dispatcher would put a `Move selection
down` row in a menu, which is furniture.
- **The panel mounts in `AppShell`,** not per module page. It needs `useCommands()`, and one mount
  gives all sixteen modules the panel at once, including the four with bespoke toolbars.
- **The panel renders `null` below `md`.** `responsive.md` is adaptive-not-shrunken: a 208px pane
  on a 390px screen is not a narrower panel, it is a different product.

## Visual direction

```
┌──────────────────────────────────────────────────────────┬ COMMANDS ────────┐
│ New▾  Item▾  Organize▾  View▾ │ ⊙▾ ⤒⤓⤷ │ ↑↓ →← │ ✎ │ ☑ Write brief │ NEW            ⌄ │
├──────────────────────────────────────────────────────────┤  ⊙ Result Area   │
│ View: Active ▾   Project: All ▾   ⌕ Search…    Filter…    │  ▣ Project       │
│ Group by: Category ▾   Roomy│Dense   ☑ Next actions       │  ☑ Task          │
├──────────────────────────────────────────────────────────┤ INSERT ROW     ⌄ │
│ Showing 24 of 210 · Category: Health ×          Clear all │  ⤒ Before   ⇧Ins │
├──────────────────────────────────────────────────────────┤  ⤓ After     Ins │
│ A1  Write brief                                          │  ⤷ Child    ⌃Ins │
│ A2  Study Korean                                         │ ORGANIZE       ⌄ │
└──────────────────────────────────────────────────────────┴──────────────────┘
```

Row 1 is the verbs; the icon segments are separated by hairlines so the eye finds landmarks
without reading words. Row 2 is the lens, unchanged in function. The Commands panel is the same
tree the menus hold, expanded, in the sidebar's exact row treatment — off by default.

A menu, with Achieve's icon gutter and shortcut column:

```
Organize ▾
┌──────────────────────────────────┐
│ MOVE                             │
│ ↑   Move up                 ⌥↑   │
│ ↓   Move down               ⌥↓   │
│ →   Indent                   ⇥   │
│ ←   Outdent                 ⇧⇥   │
│──────────────────────────────────│
│ EXPAND                           │
│ +   Expand all items             │
│ −   Collapse all items           │
│ ≡   Expand through level…        │
│──────────────────────────────────│
│ PRIORITY                         │
│     Remove priority gaps         │
└──────────────────────────────────┘
```

## Menu taxonomy

| Menu         | Sections                                                                                                                                                                                                                                        |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **New**      | `New` (Result Area / Goal / Dream / Project / Task) · `Insert row` (before ⇧Ins, after Ins, child ⌃Ins)                                                                                                                                         |
| **Item**     | `Item` (Open ⏎, Rename F2, Copy as text ⌘C) · `Convert to` (per kind) · `Danger` (Delete)                                                                                                                                                       |
| **Organize** | `Move` (up ⌥↑, down ⌥↓, Indent ⇥, Outdent ⇧⇥) · `Rank` (Day: A–D, clear) · `State` (Day: in progress / delegated / cancelled) · `Expand` (selected, all, collapse all, through level…) · `Priority` (remove gaps, reprioritize unique) · `Zoom` |
| **View**     | `Saved views` (Save…, Update, Rename…, Delete) · `Layout` (Show Fields, Filter…, Reset this grid) · `Panels` (Commands panel)                                                                                                                   |
| **Tools**    | page-specific extras only (Day's reset grid, Metrics settings)                                                                                                                                                                                  |

A menu with nothing in it does not render — the same "a tab declares what it has, it does not
assemble buttons" rule `data-grid.md` already imposes. Toolbar promotions: `New ▾`, insert
before/after/child, move up/down, indent/outdent, rename.

## Context

- **Visuals:** `visuals/achieve-outline-commands-panel-and-toolbars.png` (the grouped task pane
  and the two icon toolbars), `visuals/achieve-outline-menu.png` (sections, icon gutter, shortcut
  column, submenus), `visuals/achieve-outline-row-menu.png` (the sectioned row menu with
  `Insert ▸` / `Outline ▸` / `Actions ▸` submenus the next spec will build).
- **References:** see `references.md`.
- **Product alignment:** finishes the Phase 1 "light polish on the main grids" line for command
  discoverability, the way `2026-08-04-0924-grid-control-surface` finished it for filtering.

## Explicit divergence from Achieve

- No draggable or floating toolbars, and no `Window` menu — there is one cloud workspace, not
  files, so `File`/`Window` semantics collapse into views, import/export and settings.
- No `Format` menu: rows are not styled text.
- Achieve's nine `Expand to Level N` menu rows stay a single level picker, as the frozen spec
  decided, because nine rows is a mobile sheet nobody scrolls.
- Achieve's menu bar was app-global; ours is per view, because navigation already belongs to the
  sidebar and a global bar would repeat it.

## Standards applied

- `navigation.md` — one registry, complete palette, short contextual menu, no palette-only
  command, unavailable-not-absent, shell state as a setting. This slice **amends** it (Task 11).
- `data-grid.md` — a tab declares what it has; the toolbar tier tests. Also amended.
- `ux-principles.md` — user verbs, a gesture nobody can see is not a discoverable action.
- `responsive.md` — one panning row and a pinned overflow below `md`, 44px targets, adaptive not
  shrunken.
- `modal-pattern.md` — the existing level/zoom pickers keep `ModalShell`.
- `testing.md` — pure logic beside its source; no React component tests; browser verification.
