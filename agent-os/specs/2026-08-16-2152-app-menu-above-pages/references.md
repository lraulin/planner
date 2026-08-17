# References for app-level menu bar

## Governing specs

### `agent-os/specs/2026-08-13-1050-menu-completeness/`

- **Relationship:** Extends — menus are the source of truth; File on every AppShell destination; `DestinationCommandBar` was the File-only stopgap.
- **Relevant decisions:** A command without `menu` is not shipped (except `go.*`). File is registered at the shell. Overview / Organizer / Journal got a command row so File was visible. Focused flows and Settings were left without one.

### `agent-os/specs/2026-08-06-1010-command-surface/`

- **Relationship:** Extends the surface model. **Supersedes** the shape.md line _"Achieve's menu bar was app-global; ours is per view, because navigation already belongs to the sidebar."_
- **Relevant decisions:** One registry; named sectioned menus; icon toolbar as a weighted subset; Commands panel as the same tree left open; `⋯` is the phone menu. That "per view" placement is what put the menu under the page bar.

### `agent-os/specs/2026-08-05-0838-navigation-and-command-surface/`

- **Relationship:** Extends — sidebar + palette; one command registry.

### `agent-os/specs/2026-08-04-0924-grid-control-surface/`

- **Relationship:** Coordinates with; does not supersede.
- **Relevant decisions:** `Filter…` on the lens; chips + `Clear all`; a toolbar `Clear filters` button is forbidden because its only two states were unavailable and duplicated.

### `agent-os/specs/2026-08-13-0747-module-pages/`

- **Relationship:** Extends the page bar. This spec changes only its rank relative to the menu, not what it lists.

## Similar implementations

### Shell + page bar (today: tabs above the menu)

- **Location:** `src/components/shell/AppShell.tsx`, `PageBar.tsx`
- **Relevance:** `PageBar` is already shell-owned. The menu is not. Lifting `CommandMenuBar` next to it is the same seam.

### Per-page menu (the thing we lift)

- **Location:** `src/components/grid/CommandBar.tsx`, `CommandMenuBar.tsx`, `DestinationCommandBar.tsx`, `GridToolbar.tsx`
- **Relevance:** `CommandBar` currently draws named menus + icon segments + selection chip. After this spec it draws only the last two. `DestinationCommandBar` exists so File appears on pages with no grid command row — obsolete once the shell owns the menu.

### Dual-grid targeting (already on Commitments)

- **Location:** `src/lib/commands/scope.ts`, `src/components/finances/commitments/CommitmentsView.tsx`
- **Relevance:** `commandScope` stamps `view.filter.bills` vs last-wins. The page also registers unscoped `view.filter` for the focused grid and draws a focus ring. Extract that focused list; add `view.clear-filters`.

### Focused flows (must not grow a menu)

- **Location:** `src/lib/navigation/pages.ts` (`pageForPathname`), `pages.test.ts`
- **Relevance:** `/schedule/plan`, `/schedule/time-chart/[id]`, `/fitness/log` are AppShell children (Fitness via layout) but not pages. Detect them with a pure helper next to `pageForPathname`. Do not use "no page bar" — Chooser and Metrics have no page bar and still need the menu.

### Pages with no menu today

- `src/components/finances/insights/InsightsView.tsx`
- `src/components/finances/dashboard/DashboardView.tsx`
