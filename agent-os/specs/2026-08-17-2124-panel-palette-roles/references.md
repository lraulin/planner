# References for Commands panel vs command palette

**Status: frozen / complete** (2026-08-17)

## Governing specs

### `agent-os/specs/2026-08-06-1010-command-surface/`

- **Relationship:** Extends — the Commands panel, the menu bar, and the palette as four
  renderings of one registry
- **Relevant decisions:** panel is opt-in, remembered, hidden below `md`; same tree as the
  menus; palette stays flat and complete

### `agent-os/specs/2026-08-13-1050-menu-completeness/`

- **Relationship:** Extends — menus as the catalog; View ▸ Command palette; File registered
  at the shell so the panel and `⋯` see it
- **Relevant decisions:** palette = menus + Go-to; no Go menu; a command without `menu` is
  not shipped except `group: "go"`

### `agent-os/specs/2026-08-05-0838-navigation-and-command-surface/`

- **Relationship:** Extends — the palette is Achieve's Go menu, plus the command index
- **Relevant decisions:** sidebar Search… teaches `⌘K`; no command is palette-only

## Similar implementations

### Command palette

- **Location:** `src/components/shell/CommandPalette.tsx`,
  `src/lib/commands/registry.ts` (`matchCommands`, `mergeCommands`)
- **Relevance:** already searchable; already merges global + contextual commands; missing
  the `CommandGlyph` the other surfaces draw
- **Key patterns:** unmount while closed; `isTypingTarget` / `isModalOpen` guards; empty
  query keeps group order

### Commands panel

- **Location:** `src/components/shell/CommandsPanel.tsx`
- **Relevance:** the tree left open; the thing we are _not_ adding a search box to
- **Key patterns:** `buildMenus`, per-section collapse in `shell` settings, File via
  `FileCommands`

### Sidebar Search… row

- **Location:** `src/components/shell/Sidebar.tsx`
- **Relevance:** the discoverable opener. Dispatches `planner:command-palette`. Not a
  search implementation of its own.

### More sheet

- **Location:** `src/components/shell/MoreSheet.tsx`
- **Relevance:** explicitly has no command palette. The palette file comment that claims a
  Search row here is stale.
