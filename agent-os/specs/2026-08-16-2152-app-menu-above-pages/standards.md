# Standards for app-level menu bar

**Status: frozen / complete** (2026-08-16)

References, not copies. The live files are the source of truth; this spec amends the sentences below.

@agent-os/standards/components/navigation.md
@agent-os/standards/components/data-grid.md
@agent-os/standards/components/ux-principles.md
@agent-os/standards/components/responsive.md
@agent-os/standards/development/testing.md
@agent-os/standards/development/clean-code.md

These standards cover:

- The menu bar as the complete catalog; toolbar ⊂ menus; File leftmost; `go.*` exception
- Grid lens `Filter…`, chip-bar `Clear all`, and the test that forbids a toolbar `Clear filters` button
- Adaptive phone chrome: `⋯` is the menu below `md`
- Tests live in `src/lib`; no React component tests; `npm run smoke` after `src/app` / `AppShell` changes
- One shared implementation per concern (`CommandMenuBar`, `scope.ts`)

## Sentences this spec amends

In `navigation.md` (before this spec):

- Surfaces table: page bar "Above the toolbar"; menu bar "Every destination's command row"
- "The bar gets its own row, above the toolbar, below the phone header"

After this spec those become: application menu → page bar → page toolbars / content. The menu belongs to the application, not the tab. Dual-grid commands use a focused shortcut plus explicit `… for [grid name]` rows. Focused flows may suppress the menu; a merely simple destination may not.

In `data-grid.md`:

- Row 1 of `GridToolbar` is no longer "the view's named menus". Named menus live in the shell. Row 1 is the page verb row (icons + selection chip).
- `Clear filters` is a View / palette command, still not a toolbar button.

In `responsive.md`:

- `⋯` is the phone menu on the **shell**, not on the view's toolbar.
