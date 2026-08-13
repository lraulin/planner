# Command completeness — Shaping Notes

**Status: frozen / complete** (2026-08-13)

## Scope

Close the completeness gap between the command palette and the menus, write that rule into the coding standards, and apply it consistently.

Menus are the discoverability catalog. Toolbars and the Commands panel / `⌘K` palette are accelerators. Every command that appears in the palette or on a toolbar must also appear in a named menu — except Go-to destinations, whose visual catalog is the sidebar.

Also in scope: a toolbar/label consistency pass (same name and icon on every surface; icon row stays a high-frequency subset).

### Out of scope

- Broader visual/UX rewrite (dialogs, empty states, one-off page chrome that is not a command).
- Restoring Achieve’s File / Actions / Go / Outline menu names.
- A Go menu.
- Deferred command-surface follow-ups: customisable icon row, rebindable shortcuts, New split-button.
- A Help menu.
- Command rows on focused flows (weekly wizard, time-chart editor, fitness editors).
- Settings (outside `AppShell`).

## Decisions

- **File**, leftmost, always present on AppShell destinations: Quick capture, Process Inbox, Plan Week…, Settings, Sign out.
- **Go-to stays sidebar + palette.** The investigation allows palette extras; the sidebar is the visual catalog for navigation.
- **File is registered at the shell**, not only merged into `CommandBar`. Panel and `⋯` read `useCommands()`.
- **View ▸ Command palette** so `⌘K` is a menu command, not only a sidebar hint.
- **Achieve divergence:** Plan Week and Options were Tools there; File was data files. We have no data-file File menu, so app-wide commands live in File. Tools stays the per-view extras menu.
- Product framing: polish of chrome already marked delivered. No new features.

## Context

- **Visuals:** None new. Existing Achieve screenshots in `specs/2026-08-06-1010-command-surface/visuals/` remain the layout reference.
- **References:** `globalCommands.ts` (the gap), `menus.ts` (`buildMenus` drops commands with no `menu`), `CommandBar.tsx`, `CommandsPanel.tsx`, `OverflowMenu.tsx`, `registry.ts`.
- **Product alignment:** Mission is Achieve workflow + modern keyboard-driven UX. Command surface is already delivered on the roadmap; this spec makes menus the complete catalog of that surface.

## Standards Applied

- `components/navigation.md` — governing; this spec amends it (menus as source of truth, File, toolbar ⊂ menus, Go-to exception).
- `components/ux-principles.md` — discoverability paragraph still describes `⋯` as the desktop home.
- `components/data-grid.md` — three-tier table; menu row should be the catalog, not “occasional only.”
- `components/responsive.md` — `⋯` is the phone menu bar; File must appear there.
- `development/testing.md` — completeness invariant in `src/lib`; no component tests.
- `development/clean-code.md` — one registry, one `CommandBar`, no second File menu.
- `development/commits.md` — one logical change, Spec trailer.
