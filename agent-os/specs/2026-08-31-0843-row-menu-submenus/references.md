# References for Compact row-menu submenus

## Governing specs

### `agent-os/specs/2026-08-06-1506-right-click-completion/`

- **Relationship:** Extends the submenu machinery, blank-area menu, and floor of two. Supersedes only the “Move stays flat” clause of decision 2.
- **Relevant decisions:** `NESTED_SECTIONS` is declared, not a length threshold; a single member stays inline; the same flag drives the menu bar and the row menu; Commands panel does not fold; fly-out on desktop, drill-in on touch.

### `agent-os/specs/2026-08-06-1010-command-surface/`

- **Relationship:** Extends. One registry, placement as a property of the command (`menu` / `section` / `icon` / `toolbar` / `rowMenu`).
- **Relevant decisions:** the row menu is a shorter view of the same tree; `rowMenu: true` is the opt-in.

## Similar implementations

### `src/lib/commands/menus.ts`

- **Relevance:** `MENU_SECTIONS`, `NESTED_SECTIONS`, `rowMenuSections`, `buildMenus`. Task 2 is a two-line change here plus the comment that currently forbids nesting Move.
- **Key patterns:** `section()` sets `submenu` when the label is in the set and `commands.length > 1`. Tests in `menus.test.ts` pin “verb families stay flat” — that test must drop Move and keep Item / Danger.

### `src/lib/grid/commandDeck.ts`

- **Relevance:** every command this spec moves or opts into the row menu is built here. `record.view-tasks` / `view-project` / `view-in-outline` currently `section: "Item"`. Expand all / Zoom out currently omit `rowMenu`.
- **Key patterns:** disabled-with-`title`; `outlineZoom?: boolean` needs to carry `zoomed` for the new reason. Tests in `commandDeck.test.ts` already assert the Outline row-menu section order (`Item`, `Convert to`, `New`, `Insert row`, `Move`, `Expand`, `Priority`, `Zoom`, `Danger`).

### `src/components/grid/ContextMenu.tsx`

- **Relevance:** `menuItemsFor` is where one-command sections still emit `{ heading }`. Nested sections already skip the heading. Consecutive submenu rows skip the separator between them.
- **Key patterns:** do not add a React test; extract the heading decision into `src/lib/commands/` if it needs a unit test.

### `src/components/outline/OutlineGrid.tsx`

- **Relevance:** `capabilitiesFor` already passes `outlineZoom: true` and the zoom actions. Task 3 threads `{ zoomed: zoom !== null }`. `record.move-to` is a `pageCommands` entry in section `Move`, so it nests with the built-in moves once Move is in `NESTED_SECTIONS`.

### `src/components/grid/rowMenu.ts`

- **Relevance:** `rowMenuFor` stays the one builder. No host should go back to a hand-written list.

## Visuals

- `visuals/outline-row-menu-before.png` — user’s capture of the current Outline row menu (gitignored by `agent-os/specs/**/visuals/*`). The menu is ITEM (12 verbs + Convert to ▸), NEW, MOVE (5 + State ▸), EXPAND (1), PRIORITY (1), ZOOM (1, clipped by the dock).
- `agent-os/specs/2026-08-06-1506-right-click-completion/visuals/achieve-outline-row-menu.png` — Achieve’s outline menu: frequent verbs at the top, `Insert ▸` / `Outline ▸` / `Actions ▸` nested. Guide to shape, not chrome.
