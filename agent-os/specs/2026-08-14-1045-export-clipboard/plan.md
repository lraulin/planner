# Export to clipboard (Option-swap + always-visible path)

**Status: frozen / complete** (2026-08-14)  
Spec folder: `agent-os/specs/2026-08-14-1045-export-clipboard/`

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-14-1021-grid-export-formats/` — same on-screen snapshot, same three encodings (CSV / JSON / YAML), still owned by `DataGrid`, still menu-only
- **Extends:** `agent-os/specs/2026-08-13-1050-menu-completeness/` — a command without a menu is not shipped; same label on every surface except the Option-held pulldown swap

Does **not** add formats. PNG / JPEG / SVG in the shaping prompt were examples from a generic UI note.

## Context

File ▸ Export ▸ already downloads the current view. Pasting that same text into a note, a chat, or another tool currently means download-then-open. Finder-style Option on the existing rows is the fast path; a permanent Copy to Clipboard submenu is the one you can find without knowing the modifier.

## Decisions

1. **Same three encodings.** CSV, JSON, YAML — the text `serializeGridExport` already produces. No new formats.
2. **Option/Alt on the Export fly-out swaps the leaf labels and the action.** `CSV` becomes `Copy CSV to Clipboard` (and JSON / YAML the same way) while the key is held. Releasing restores download. The parent row stays **Export**. This is Finder's "Copy as Pathname": the item you are looking at changes, the menu does not grow.
3. **Permanent File ▸ Copy to Clipboard ▸** CSV / JSON / YAML. Declared nestable, after Export, before Account. The discoverable path for the Commands panel, `⌘K`, phone `⋯`, and anyone who does not hold Option. Labels are the full `Copy CSV to Clipboard` so the palette is not two rows both called `CSV`.
4. **`Command.alternate`** carries the Option-held label, title, and run. Only pulldown menus (`ContextMenu`) honour it. The Commands panel and palette keep the primary label — an always-open list that rewrites itself when you hold a modifier is a different product.
5. **Option is `event.altKey`.** Fine on macOS. On Windows/Linux Alt is awkward; the permanent submenu is the path there. No Shift/Ctrl fallback that would collide with existing chords.
6. **No dedicated keyboard shortcut.** This is occasional, same as download. Palette + the permanent submenu cover the keyboard.
7. **Clipboard write is `writeClipboardText`.** Same helper as Copy as text. Silent on success — this app has no toast, and Copy as text is already silent. Inventing a toast for one of two clipboard verbs is the two-descriptions problem. Follow-up if we ever flash every clipboard write.
8. **Still menu-only**, still registered by `DataGrid`, still identity-stable via the snapshot ref.

## Acceptance criteria

- [x] Holding Option/Alt with File ▸ Export open rewrites CSV / JSON / YAML to `Copy … to Clipboard` and choosing one writes that encoding to the clipboard (no download).
- [x] Releasing Option restores the download labels and action without closing the menu.
- [x] File ▸ Copy to Clipboard ▸ CSV / JSON / YAML is always present on every DataGrid (desktop File, Commands panel, phone `⋯`, `⌘K`).
- [x] Clipboard text matches the download of the same format (nested JSON/YAML, flat CSV).
- [x] Insights still has neither Export nor Copy to Clipboard.
- [x] No PNG/JPEG/SVG or other new encodings.

## Changes from original plan

| #   | Change                      | Why |
| --- | --------------------------- | --- |
|     | _(filled during implement)_ |     |

## Task 1: Save Spec Documentation

Create this folder. **Status: active.**

## Task 2: `Command.alternate` and Option-swap in `ContextMenu`

Add `alternate` to the command type. `menuItemsFor` copies it onto the row. `ContextMenu` tracks `altKey` and swaps label / title / run while the key is down.

## Task 3: Copy commands + DataGrid wiring

`gridCopyCommands`, Export commands grow `alternate`, `"Copy to Clipboard"` in `MENU_SECTIONS.file` and `NESTED_SECTIONS`. `DataGrid` registers both families and writes via `writeClipboardText`.

## Task 4: Tests

Pure tests: alternate labels, submenu placement, format-of-id. No component tests.

## Task 5: Verify, freeze spec

- Outline: Option-held Export copies nested JSON; release downloads again
- File ▸ Copy to Clipboard on desktop, panel, phone `⋯`
- Register copy is flat
- Insights has no copy family
- `test:unit`, typecheck, lint
- Verified in the browser: Option down rewrites Export ▸ to Copy CSV/JSON/YAML to Clipboard and up restores; File ▸ Copy to Clipboard writes nested Outline JSON (`Career → Become a Programmer…`); Insights has neither family; phone `⋯` drills into the three copy rows.

## Follow-ups (new work — not amendments to this frozen spec)

- A shared flash for every clipboard write (this one and Copy as text)
- A dedicated shortcut if copy-export becomes frequent
