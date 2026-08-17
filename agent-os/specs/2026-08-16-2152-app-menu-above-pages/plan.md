# App-level menu bar (above the page tabs)

**Status: frozen / complete** (2026-08-16)  
Spec folder: `agent-os/specs/2026-08-16-2152-app-menu-above-pages/`

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-13-1050-menu-completeness/` — menus are the completeness catalog; File leftmost; toolbar ⊂ menus; `go.*` stays sidebar + palette
- **Extends:** `agent-os/specs/2026-08-06-1010-command-surface/` — one registry, named sectioned menus, icon row, Commands panel, `⋯` is the phone menu
- **Extends:** `agent-os/specs/2026-08-05-0838-navigation-and-command-surface/` — sidebar + palette; one command registry
- **Coordinates with:** `agent-os/specs/2026-08-04-0924-grid-control-surface/` — `Filter…` stays on the lens row; chips keep `Clear all`; a toolbar `Clear filters` button stays forbidden
- **Supersedes:** `2026-08-06-1010-command-surface` shape.md decision _"Achieve's menu bar was app-global; ours is per view, because navigation already belongs to the sidebar"_
- **Supersedes:** `navigation.md` placement that the page bar sits above the destination's command row (the menu bar)

This is a **delta**. It does not reopen File contents, Go-to, icon-row curation, or the filter panel itself.

## Context

We adopted a real desktop-style menu as the authoritative command catalog (`navigation.md`: a command without `menu` is not shipped). Two chrome facts now undermine that rule:

1. **The page bar sits above the menu.** `AppShell` renders `PageBar`, then the page renders `CommandBar` inside `TabToolbar`. The menu reads as belonging to the current tab. It also jumps when you switch pages.
2. **Some AppShell destinations have no menu at all.** Insights and the Finances dashboard never mount `CommandBar` / `DestinationCommandBar`. File exists in `⌘K` and nowhere you can see — the exact hole menu-completeness closed for Overview / Journal / Organizer.

A third, related gap: when two grids share a page, the catalog must name **which** grid a filter command targets. Commitments already has most of this (`commandScope`, focused `view.filter`, visual focus ring). It is not written into the standard, so the next dual-grid page will invent a third shape.

Product frame: polish of chrome already marked delivered. No new roadmap feature.

## Decisions

1. **The menu bar is application chrome.** `AppShell` renders `CommandMenuBar` from `useCommands()`, **above** `PageBar`. File is leftmost and always present. New / Item / Organize / View / Tools still appear when the destination has something for them. The bar is a thin, modern strip — not a 2005 Win32 clone.
2. **Lift the named menus only.** Icon buttons, selection chip, and the lens row (`Filter…`, search, grouping, density) stay on the page, next to the data. Sidebar logo and File ▸ Sign out stay where they are. No second logo / palette / user chrome.
3. **Hybrid layout, conventional order:**

   ```
   ┌─ sidebar ─┬──────────────────────────────────────────────┐
   │  app name │  File  New  Item  Organize  View  Tools      │  ← application menu
   │  modules  ├──────────────────────────────────────────────┤
   │           │  Outline | Tasks | Goals | …                 │  ← page bar
   │           ├──────────────────────────────────────────────┤
   │           │  [icons] [selection]                         │  ← page verb row
   │           │  view · search · Filter… · Group by · density│  ← lens
   │           │  grid / content                              │
   └───────────┴──────────────────────────────────────────────┘
   ```

4. **Every AppShell destination has the menu.** Insights and Dashboard get File + whatever View commands they actually have (enabled/disabled, never invented). Settings stays outside `AppShell`. **Focused flows stay menu-less on purpose** (weekly wizard, `/fitness/log`, time-chart editor, fitness session/exercise editors). Detect those flows explicitly — do not treat "no page bar" as the signal, or Chooser / Metrics lose their menu.
5. **Dual-grid View menu is compact and flat** (not nested submenus):

   ```
   View
   ├── Filter…                          ← focused grid
   ├── Clear filters                    ← focused grid; disabled when none
   ├── ────────
   ├── Filter for Subscriptions & bills…
   ├── Clear filters for Subscriptions & bills
   ├── Filter for Recurring spend…
   ├── Clear filters for Recurring spend
   └── …
   ```

   One grid: only the unscoped `Filter…` / `Clear filters`. Same rows in `⌘K`, searchable by grid name. Keep the existing **Filter…** spelling (not "Filters...").

6. **Toolbar vs menu for filtering**

   | Surface   | Filtering                                    |
   | --------- | -------------------------------------------- |
   | Grid lens | `Filter…` for **that** grid only             |
   | Menu bar  | focused shortcut + explicit per-grid entries |
   | `⌘K`      | all of the above, searchable by grid name    |

   The lens button is never the only path. Chip-bar `Clear all` stays. A toolbar `Clear filters` button stays forbidden (`data-grid.md`: only two states were "unavailable" and "duplicated").

7. **Focus is last-interacted grid.** Click / focus-capture sets it. A visible focus ring (Commitments' `border-select-edge`) makes "current grid" feel real. Default is the top grid.
8. **Keep Commitments' `commandScope` / `GridToolbarHandle` machinery.** Extract the duplicated focused-command list and add `view.clear-filters` (plus scoped ids). Do not rewrite the filter dialog.
9. **Standards change is part of the work, not a follow-up.** The superseded "per-view menu" sentence is still in `command-surface` shape.md (frozen — leave it) and implied by live `navigation.md` placement. If we ship the chrome and leave the standard, the next feature will put the menu back under the tabs.

### Out of scope

- New top chrome (app name + palette button + user on the menu row)
- Moving the icon row or selection chip to the shell
- Nested per-grid View submenus
- Putting a menu on Settings or on focused flows
- Replacing Insights' own filter widgets with the grid `Filter…` dialog
- Customisable icon row, rebindable shortcuts, Help menu
- Changing how the filter panel or chips work

## Acceptance criteria

- [x] Desktop: named menus render in `AppShell`, above the page bar, on every AppShell destination that is not a focused flow
- [x] Switching Plan pages (Outline → Tasks → Goals) does not move the menu under the tabs; File stays put
- [x] Icon row, selection chip, and lens `Filter…` stay on the page with the grid
- [x] Insights and the Finances dashboard show File (Quick capture, Process Inbox, Plan Week…, Settings, Sign out) without growing a fake grid toolbar
- [x] Weekly wizard, `/fitness/log`, and the time-chart editor have **no** application menu
- [x] One-grid pages: View has `Filter…` and `Clear filters` (disabled with a specific reason when nothing is filtered). No "for [name]" rows
- [x] Commitments: View has focused `Filter…` / `Clear filters` plus explicit `Filter for …` / `Clear filters for …` for both grids; `⌘K` lists the same labels
- [x] Focused `Filter…` opens the last-focused grid's existing panel; clicking the other grid changes which one it targets; a focus ring marks the current grid
- [x] Each grid's lens `Filter…` still opens only that grid's panel
- [x] No toolbar `Clear filters` button; chips still offer `Clear all`
- [x] Below `md`, `⋯` is still the menu and is available on destinations that have no page toolbar (shell-owned, not only `TabToolbar`)
- [x] `DestinationCommandBar` is no longer required for File to appear
- [x] `navigation.md` (and the short pointers in `ux-principles.md`, `data-grid.md`, `responsive.md`) state the new placement, the dual-grid targeting rule, and the focused-flow exception
- [x] `test:unit`; typecheck; lint; `npm run smoke` (this touches `src/app/**` / `AppShell`); browser at 1280×800 and 390×844

## Changes from original plan

Material refinements during implementation (requirements, design, scope). Omit pure code polish.

| #   | Change                                                                                          | Why                                                                                                                              |
| --- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Commands panel toggle moved onto the application menu row, not the page verb row.               | Insights and Dashboard never mount `CommandBar`; the toggle would have vanished with the File-only bars.                         |
| 2   | `DestinationCommandBar` deleted rather than kept as an empty shell.                             | Once File, the named menus, and phone `⋯` live in `AppShell`, the component had nothing left to draw.                            |
| 3   | Dual-grid layout commands are published once from the page (`dualGridViewCommands`), not twice. | Child `GridToolbar`s mount first; if they also registered scoped `view.filter.*`, those rows would precede the focused shortcut. |

## Task 1: Save Spec Documentation

Create this folder. Done when the five files exist and this plan is **Status: active**.

## Task 2: Update the coding standards

Rewrite placement in `navigation.md`; point `data-grid.md`, `ux-principles.md`, `responsive.md`, and `index.yml` at the new stack. Do this before the chrome move.

## Task 3: Shell-owned menu bar

`AppShell` draws `CommandMenuBar` above `PageBar`. `CommandBar` keeps icons + chip. Phone `⋯` is shell-owned. Focused flows suppress the menu via a pure path helper.

## Task 4: Dual-grid targeting + Clear filters

`view.clear-filters` (and scoped ids). Extract Commitments' focused-command list. One-grid pages stay unscoped.

## Task 5: Every destination; retire File-only bars

Insights / Dashboard inherit File from the shell. Delete `DestinationCommandBar` if nothing is left.

## Task 6: Verify, freeze spec, update roadmap

Unit tests, typecheck, lint, smoke, browser at both widths. Freeze. One sentence on the delivered menu-completeness roadmap item.
