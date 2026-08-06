# Command Surface — Menus, Icon Toolbar, and Commands Panel

**Status: frozen / complete (2026-08-06)**
Spec folder: `agent-os/specs/2026-08-06-1010-command-surface/`
Delta on the frozen `agent-os/specs/2026-08-05-2121-command-deck-and-item-actions/`.

## Context

The previous slice got the plumbing right and the surface wrong. One command registry now feeds
the `⌘K` palette, the `⋯` overflow, and a compact deck — but what landed on screen is a flat row
of identically-bordered text buttons jumbled in with the view controls, overflowing into a single
**unsorted** list behind a three-dot button. That is a traditional app menu with the organization
removed. Achieve answered the same problem better: a menu bar, icon toolbars, a grouped
**Outline Commands** task pane, and a sectioned row menu, all reading one command set
(`visuals/`).

The left sidebar is this codebase's proof that it can do organized and polished — ordered
sections, `0.625rem` uppercase headings, icon + label rows, `bg-select` active fill, a collapsible
rail, and a row that teaches `⌘K`. The command surface has to reach that bar.

Under the visual problem sit three kinds of drift, all in scope:

- Eight views hand-write their right-click `MenuItem[]`, duplicating labels and shortcuts. Only
  Outline derives its row menu from `buildGridCommands`, and then through a 12-id allowlist.
- `Command.shortcut` is documentation only. Real bindings live in eleven separate `document`
  keydown listeners, so the printed shortcut and the working key can silently disagree.
- Metrics, Fitness, the Day header, and Schedule have bespoke toolbars with **no `⋯` at all** —
  their commands have no visible path, which breaks `navigation.md`'s "no command is
  palette-only" rule outright rather than merely looking unpolished.

**Intended outcome:** one declared menu tree renders four surfaces — a menu bar, an icon toolbar,
a pinnable Commands panel, and the row menu — plus the palette. A command is declared once, with
its icon, its binding, and its place, and cannot disagree with itself.

## Decisions

1. **Menu bar plus an optional panel.** A thin bar of named, sectioned menus
   (`New · Item · Organize · View · Tools`) is the default surface. A pinnable **Commands** panel
   shows the same tree expanded in the sidebar's visual language; it is opt-in and remembered per
   user.
2. **Two thin rows.** Row 1 is the verbs (menu bar, primary icon buttons, selection context,
   panel toggle). Row 2 is the lens (view picker, scope selects, search, Filter, Group by,
   switches, Density), with the existing chip bar beneath it. Verbs above lens: "what can I do"
   before "what am I looking at".
3. **An icon set drawn like `navIcons`.** ~16 new 20×20 / `strokeWidth 1.5` glyphs on the same
   shared `BASE`. Icons carry the primary toolbar actions and fill a left gutter in every menu,
   as Achieve's did. No icon dependency added — `tech-stack.md` still has no component library.
4. **`⋯` becomes the phone's menu bar.** Desktop has real menus, so the overflow retires there.
   Below `md` it stays, but renders the same _sectioned_ tree instead of today's unsorted dump.
5. **The row menu is registry-derived here; its content grows in the next spec.** This slice
   makes one source of truth. Submenus (`Insert ▸`, as Achieve had) and new command families are
   deliberately left to the follow-on right-click spec.
6. **Selection movement is navigation, not a command.** Arrow-key row movement and shift-extend
   stay in each view. Only keys that correspond to a _registered command_ move into `binding`.
7. **Destructive stays out of the icon row.** Delete lives in the menus and the row menu, with
   confirmation owned by the existing dialogs — unchanged from the frozen spec.

## Acceptance criteria

- [x] Every grid command reaches the user through a **named, sectioned** menu; no surface shows an
      unsorted list of a view's commands.
- [x] One declaration per command drives the menu bar, the icon toolbar, the Commands panel, the
      row menu, and the palette. No view hand-writes a `MenuItem[]` for a row.
- [x] A printed shortcut is derived from the binding that actually fires, so the two cannot drift.
- [x] Verbs and lens occupy separate rows on desktop; below `md` a single panning lens row plus a
      pinned `⋯` that opens the sectioned tree.
- [x] The Commands panel matches the sidebar's section headings, row treatment and hover/active
      states, collapses per section, and survives reload.
- [x] Metrics, Fitness and Schedule expose their commands without keyboard knowledge. (Day did too,
      via its grid — see change 1.)
- [x] Unavailable commands are disabled with a reason everywhere they appear, not filtered out.
- [x] Unit, integration, typecheck, lint, build, and browser verification at 1280×800 and 390×844
      all run.
- [x] `navigation.md` and `data-grid.md` describe the surface that was actually built.

## Changes from original plan

| #   | Change                                                                                                                                                                   | Why                                                                                                                                                                                                                                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | The **Day header** was left alone. The Day module's command row lives in `DailyItemsGrid` instead.                                                                       | On inspection the header holds only date paging and a Day/Week toggle — all lens, no verbs. Putting a command row there would have split the Day's commands across two bars.                                                               |
| 2   | `ScheduleView` keeps its hand-rolled bar rather than adopting `TabToolbar`.                                                                                              | It is not a `DataGrid` host; its lens row is a Time Chart picker and two pagers with their own responsive rules. It got the same two-row shape and the same `CommandBar`, which is what the rule is actually about.                        |
| 3   | Added **`toolbarSegments`** — the command row's hairline groups are derived from the weight decade.                                                                      | The alternative was a second list saying which cluster each command belongs to, which is the two-descriptions problem in miniature.                                                                                                        |
| 4   | The row menu orders `item` before `new` and sinks any all-destructive section to the bottom, rather than using the menu bar's order.                                     | You right-clicked a row to act on _that row_, so `Open` leads and `Insert row` follows; and a menu that opens under the pointer must not put Delete two rows from the top.                                                                 |
| 5   | `pageCommands` became a documented **override channel** — a page command carrying a built-in's id replaces it.                                                           | Three views needed it honestly: the Wish List opens an _owner_, the Day opens a _task_, Notes creates a _note_. All three previously solved it by hand-writing a row menu with a different label from their own toolbar.                   |
| 6   | Added `GridSelectionCapability.moveReason`.                                                                                                                              | Notes' moves need manual order in nested mode. The generic "Cannot indent this row" sends you looking at the row instead of at the Sort control.                                                                                           |
| 7   | Extracted `MenuList` and made `ColumnMenu` use it.                                                                                                                       | `ColumnMenu` was a second renderer of `MenuItem[]` and had already drifted to a different gap. Two renderers of the one type whose purpose is to have one renderer.                                                                        |
| 8   | Capped `ContextMenu` to the viewport with internal scrolling.                                                                                                            | `⋯` is the phone's whole menu bar now, so on the Outline it holds ~40 rows — taller than an iPhone. Before the cap, the rows past the fold were unreachable.                                                                               |
| 9   | Deleted the `rowActions` prop.                                                                                                                                           | The Task Chooser was its last caller, and the Chooser now declares full capabilities like every other projection of the tree.                                                                                                              |
| 10  | The Day grid's twelve right-click-only verbs (`Rank A`–`D`, `Clear rank`, the three `Mark …` states, `Move to tomorrow`, `Promote to task…`) became registered commands. | Folding the row menu into the registry required them to exist there. They are now in the menu bar, the panel and `⌘K` — verified: typing "rank" in the palette on `/day` returns all five ranking commands, which returned nothing before. |
| 11  | `data-grid.md`'s "keep commands and view controls in separate bars **where a view has many commands**" became unconditional.                                             | It was a conditional rule that exactly one view followed, with a bespoke second bar. It is now the shape of `GridToolbar` itself.                                                                                                          |

## Follow-ups (new work — not amendments to this frozen spec)

- **Right-click menu expansion** (the next spec, per the user): submenus in `ContextMenu` so
  `Insert ▸` / `Convert to ▸` nest the way Achieve's did, and new command families on the row menu.
  The Outline's row menu also does not currently offer the Priority or Zoom sections — its
  `rowMenu` capabilities omit `priorityMaintenance` and `outlineZoom` — which is content to decide
  there rather than a defect here.
- **A user-customisable command row** (pin/reorder your own icons, Office's Quick Access Toolbar).
  `toolbar` is already a weight, so this is a stored override map rather than new architecture.
- **Rebindable shortcuts** — Achieve had a Customize Keyboard dialog
  (`screenshots/CustomizeKeyboardSS.png`). `bindings` on the descriptor is the shape that makes it
  possible; nothing reads a stored override yet.
- **A `New ▾` split button.** The default-kind `+` and the per-kind list are currently a button and
  a menu that happen to sit next to each other.

## Task 1: Save spec documentation

This folder: `plan.md`, `shape.md`, `standards.md`, `references.md`, and `visuals/` holding the
three Achieve references (commands panel + toolbars, the Outline menu, the row menu).

## Task 2: The pure command model

Extend `Command` in `src/lib/commands/registry.ts` with the placement axis (`menu`, `section`,
`icon`, `toolbar`, `rowMenu`, `binding`). Add `src/lib/commands/menus.ts` (`buildMenus`,
`toolbarCommands`, `rowMenuSpec`) and `src/lib/commands/bindings.ts` (`KeyBinding`,
`matchBinding`, `formatBinding`), each with an adjacent test. Retire `overflowCommands`,
`primaryGridCommands` and `moreGridCommands`.

`icon` is a **string id**, not a component: `src/lib` is tested under vitest's `node` environment
and must stay free of JSX.

## Task 3: The command icon set

Extract the `BASE` spread out of `navIcons.tsx` into `src/components/icons/glyph.ts`; add
`commandIcons.tsx` with the glyph vocabulary and a `COMMAND_ICONS` record keyed by `CommandIcon`.

## Task 4: The menu renderer

`ContextMenu` gains section headings and a per-item icon gutter, with `step()` skipping headings
exactly as it skips separators. Add `MenuButton` (anchored like `OverflowMenu`'s) and
`CommandMenuBar`.

## Task 5: Two-row toolbar

Split `TabToolbar` into a two-row shell: `CommandBar` (verbs) and `ViewBar` (lens). Rewire
`GridToolbar`, delete `GridCommandDeck`, and keep the single panning row below `md`.

## Task 6: Declare placements everywhere

Add `menu` / `section` / `icon` / `binding` / `toolbar` to `buildGridCommands`,
`useNodeCommandDeck`, `ViewPicker`'s saved-view commands, and every `pageCommands` list (Notes,
Contacts, Resources, Time Charts, Day, Wish List, Chooser).

## Task 7: Row menus from the registry

`rowMenuSpec` drives all eight views' right-click menus. Delete the hand-written builders and the
Outline allowlist.

## Task 8: One keyboard dispatcher

`useCommandKeys(commands, { suspended })` installs a single `document` listener using
`matchBinding` and the existing `isTypingTarget` guard. Command bindings move out of the per-view
handlers; selection navigation stays.

## Task 9: The Commands panel

`CommandsPanel` in the sidebar's visual language, mounted in `AppShell` as a right-hand column so
every module gets it. `ShellSettings` gains `commandsPanelOpen` and `commandsPanelCollapsed`, with
codec tests; the parser must return defaults for an unusable blob, because it runs before the
first paint.

## Task 10: Bespoke toolbars onto the shared surface

Metrics, Fitness, the Day header and Schedule get the shared `CommandBar` — at minimum a menu bar
and the phone's overflow — and their page commands gain placements.

## Task 11: Update the standards

`navigation.md`: the three-surface table becomes four, `⋯` is documented as the phone's menu bar,
and a command declares its binding with the printed shortcut derived from it. `data-grid.md`: the
toolbar tier table gains the menu-bar tier, and the verbs/lens row split.

## Task 12: Verify, freeze spec, update roadmap

Confirm the acceptance criteria, complete **Changes from original plan**, mark the files
**frozen / complete** with the date, list follow-ups as new work (the right-click expansion spec:
submenus plus new command families), and update `agent-os/product/roadmap.md`.

---

> While this spec is **active**, a material change to requirements, design, or scope — including
> feedback on what was implemented — updates the relevant sections here and appends a row to
> **Changes from original plan**. Pure implementation detail does not. Freeze when verified.
