# Export to clipboard — Shaping Notes

**Status: frozen / complete** (2026-08-14)

## Scope

Option-held File ▸ Export rows copy the current view instead of downloading it. A permanent File ▸ Copy to Clipboard submenu is the always-visible path. CSV / JSON / YAML only.

### Out of scope

- New encodings (the PNG/JPEG/SVG in the source note were generic examples)
- A toast / status flash (Copy as text is silent; one toast system later, not one verb)
- A dedicated keyboard shortcut
- Import of clipboard text
- Changing Copy as text

## Decisions

- Finder-style Option-swap on the existing Export leaves, not extra rows in that fly-out
- Permanent sibling submenu so the Commands panel / `⌘K` / phone are not modifier-only
- `Command.alternate` is the data; only `ContextMenu` (pulldowns and `⋯`) applies it
- `altKey` only — no Windows-specific second modifier
- Reuse `writeClipboardText`

## Context

- **Visuals:** None (Finder Copy as Pathname is the reference)
- **References:** `exportCsv.ts`, `ContextMenu.tsx` (`menuItemsFor`), `copyAsText.ts` (`writeClipboardText`), frozen `2026-08-14-1021-grid-export-formats`
- **Product alignment:** File already holds Export. This is that family growing a destination, not a new module.

## Standards Applied

- `components/navigation.md` — declared families fold; a command without a menu is not shipped; same tree on every surface
- `development/testing.md` — logic in `src/lib`, no component tests
- `development/clean-code.md` — one clipboard write, one export snapshot, no second toast system
