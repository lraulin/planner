# References for command completeness

## Governing specs

### `agent-os/specs/2026-08-06-1010-command-surface/`

- **Relationship:** Extends — the surface model this spec polishes.
- **Relevant decisions:** One registry; named sectioned menus; icon toolbar as a weighted subset; Commands panel as the same tree left open; `⋯` is the phone menu bar; `ownControl` skips lens widgets from `⋯` only.

### `agent-os/specs/2026-08-05-0838-navigation-and-command-surface/`

- **Relationship:** Extends — one registry, no palette-only.
- **Relevant decisions:** Palette is Achieve’s Go menu rendered as search. The “no command is palette-only” rule is what this spec tightens into “no command is menu-less, except `go.*`.”

### `agent-os/specs/2026-08-06-1506-right-click-completion/`

- **Relationship:** Extends — row menu and calendar commands from the same tree.
- **Relevant decisions:** Same labels on right-click; unavailable is disabled; families nest where declared.

### `agent-os/specs/2026-08-13-0747-module-pages/` and `2026-08-13-0845-module-consolidation/`

- **Relationship:** Extends — Go-to destinations are modules and pages in the sidebar and palette.
- **Relevant decisions:** No Go menu. Palette generates `go.<module>` and `go.<module>.<page>` from the registries.

### `agent-os/specs/2026-08-13-0940-custom-view-working-set/`

- **Relationship:** Coordinates with; does not supersede.
- **Relevant decisions:** View-menu Save / Save as / Reset labels. Do not rename those while that spec is active.

## Similar implementations

### Global commands (the gap)

- **Location:** `src/components/shell/globalCommands.ts`
- **Relevance:** Quick capture, Process Inbox, Plan Week…, Settings, Sign out, and every Go-to entry are built here with no `menu`.
- **Key patterns:** Go-to generated from `BUILT_MODULES` / `modulePages`. App commands are a hand-written list. Palette merges this list with `useCommands()`.

### Menu tree

- **Location:** `src/lib/commands/menus.ts`, `src/lib/commands/registry.ts`
- **Relevance:** `buildMenus` drops commands with no `menu`. `COMMAND_MENUS` is the bar order. `overflowMenus` is the phone bar minus `ownControl`.
- **Key patterns:** Placement belongs to the command. Section order is a table, not build order.

### Surfaces that must agree

| Surface          | Location                                                      | Reads                                   |
| ---------------- | ------------------------------------------------------------- | --------------------------------------- |
| Desktop menu bar | `src/components/grid/CommandMenuBar.tsx` via `CommandBar.tsx` | prop list (this-render)                 |
| Icon toolbar     | `CommandBar.tsx` / `toolbarSegments`                          | same prop list                          |
| Commands panel   | `src/components/shell/CommandsPanel.tsx`                      | `useCommands()`                         |
| Phone `⋯`        | `src/components/shell/OverflowMenu.tsx`                       | `useCommands()`                         |
| Palette          | `src/components/shell/CommandPalette.tsx`                     | `useGlobalCommands()` + `useCommands()` |

A File menu that exists only on the `CommandBar` prop is invisible to the panel and `⋯`. Register at the shell **and** merge this render.

### Destinations without a command row

- `src/components/overview/OverviewView.tsx`
- `src/components/organizer/OrganizerView.tsx`
- Pattern to copy: `NotesJournal` empty `CommandBar` + `TabToolbar` + pinned `OverflowMenu`.
