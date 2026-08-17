# App-level menu bar — Shaping Notes

**Status: frozen / complete** (2026-08-16)

## Scope

Lift the named menu bar into `AppShell` so it sits above the page tabs, give every AppShell destination that menu (Insights and Dashboard included), and write dual-grid filter targeting into the catalog and the coding standards.

Local grid UX stays: each grid keeps its lens `Filter…` button and its own filter panel. The menu is the completeness / discoverability layer.

### Out of scope

- New Documents-style top chrome (logo + palette button + user on the menu row)
- Moving the icon row or selection chip to the shell
- Nested per-grid View submenus
- A menu on Settings or on focused flows
- Replacing Insights' own filter widgets with the grid dialog
- Command-surface follow-ups (custom icon row, rebindable shortcuts, Help)

## Decisions

- Menu bar is **application chrome**, above the page bar, even though this is a hybrid web app with a sidebar. Choosing a real desktop-style menu inherited that structural expectation.
- Lift **named menus only**. Verbs/lens stay on the page.
- Compact flat View rows when two grids are present: focused `Filter…` / `Clear filters`, then explicit `… for [grid name]`. Same labels in `⌘K`.
- `Clear filters` is a menu + palette command, disabled when nothing is filtered. It is **not** a toolbar button (that test in `data-grid.md` still holds; chips keep `Clear all`).
- Every AppShell destination has the menu. Focused flows suppress it on purpose. Settings stays outside the shell.
- Standards are amended in this spec, before the chrome move. Frozen spec copies of those standards are left alone.

## Context

- **Visuals:** ASCII layout in `visuals/layout.md`. No new screenshots. Achieve menu-bar shots remain under `specs/2026-08-06-1010-command-surface/visuals/`.
- **References:** `AppShell` + `PageBar` (tabs above the menu today); `CommandBar` / `CommandMenuBar` / `DestinationCommandBar`; `src/lib/commands/scope.ts`; `CommitmentsView` focused-grid + `commandScope`.
- **Product alignment:** Mission is Achieve workflow + modern keyboard-driven UX. Command surface and menu-completeness are already delivered; this is chrome that makes those rules structurally true. No new roadmap feature.

## Standards Applied

References, not copies — see `standards.md`.

- `components/navigation.md` — governing; this spec amends placement, dual-grid targeting, focused-flow exception
- `components/data-grid.md` — Filter button, Clear-filters toolbar test, verbs/lens split
- `components/ux-principles.md` — one-sentence pointer
- `components/responsive.md` — `⋯` becomes shell-owned
- `development/testing.md` — lib tests; no component tests; smoke after `src/app` / `AppShell`
- `development/clean-code.md` — one `CommandMenuBar`, one `scope.ts`, no second File menu
