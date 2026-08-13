# Command completeness — menus as the catalog

**Status: frozen / complete** (2026-08-13)  
Spec folder: `agent-os/specs/2026-08-13-1050-menu-completeness/`

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-06-1010-command-surface/` — one registry, named menus, icon toolbar, Commands panel, palette
- **Extends:** `agent-os/specs/2026-08-05-0838-navigation-and-command-surface/` — one registry, no palette-only
- **Extends:** `agent-os/specs/2026-08-06-1506-right-click-completion/` — row menu and calendar commands from the same tree
- **Extends:** `agent-os/specs/2026-08-13-0747-module-pages/` and `2026-08-13-0845-module-consolidation/` — Go-to stays sidebar + palette; no Go menu
- **Coordinates with (does not supersede):** `agent-os/specs/2026-08-13-0940-custom-view-working-set/` — View-menu Save / Save as labels
- **Amends:** `agent-os/standards/components/navigation.md`, and the command-surface paragraphs of `ux-principles.md` and `data-grid.md`

Does **not** restore Achieve’s File / Actions / Go / Outline names. Does **not** take deferred follow-ups (custom icon row, rebindable shortcuts, New split-button).

## Context

The command-surface architecture already matches platform practice: menus for completeness, toolbars for frequency, Commands panel as the same tree left open, `⌘K` as the searchable overlay. `navigation.md` already says the menu bar must be complete and no command is palette-only.

The live gap is real. `useGlobalCommands` (Quick capture, Process Inbox, Plan Week…, Settings, Sign out, and every Go-to destination) has no `menu`. `buildMenus` drops those rows. They exist in `⌘K` and, for some, in the sidebar. Anyone who opens File / Tools / View looking for Settings or Plan Week does not find them. That is the failure mode the investigation named.

This spec is polish of chrome already marked delivered: close that completeness gap, curate toolbars, align labels, and write the rule so the next command cannot land palette-only.

**Achieve divergence (intentional):** Achieve put Plan Week and Options in Tools and used File for data files. We have no data-file File menu. App-wide commands go in a new leftmost **File** menu. Go-to stays in the sidebar and in `⌘K` as the one allowed palette extra — not a Go menu.

## Decisions

1. **Menus are the source of truth for completeness.** Every command that appears on a toolbar, in the Commands panel, or in `⌘K` must appear in a named menu — except `group: "go"` destinations, whose visual catalog is the sidebar.
2. **Toolbars are a curated subset.** `toolbar` is a weight meaning “also an icon button.” Frequency + immediate action. Never the only path.
3. **Commands panel = the menu tree left open.** Same labels, same sections, same disabled reasons.
4. **Palette = menus + Go-to.** Fuzzy search, shortcuts printed, invocation already hinted in the sidebar. Add **View ▸ Command palette** (`⌘K`) so the overlay is also a menu command.
5. **New leftmost File menu**, always present on every AppShell _destination_ (module page, including Overview and the organizer):
   - Quick capture
   - Process Inbox
   - Plan Week…
   - Settings
   - Sign out
6. **Same name, icon, and action** on every surface. Unavailable is disabled with the specific reason, never removed.
7. **File is registered at the shell**, not only merged into `CommandBar`’s local list. The Commands panel and phone `⋯` read `useCommands()`; a File menu that exists only as a `CommandBar` prop would recreate the exact drift this spec exists to remove.
8. **Focused flows** (weekly wizard, time-chart editor, fitness session/exercise editors) keep their own chrome. Settings stays outside `AppShell`.
9. **Standards change is part of the work**, not a follow-up. `navigation.md` is rewritten so the next feature cannot “forget” a menu row.

## Acceptance criteria

- [x] File is the leftmost menu on every AppShell destination and contains Quick capture, Process Inbox, Plan Week…, Settings, and Sign out, with the same labels as `⌘K`.
- [x] View ▸ Command palette opens the palette and prints `⌘K`.
- [x] Go-to destinations remain sidebar + `⌘K` only — no Go menu.
- [x] Every non-`go` registered command has a `menu`. A unit test fails if one does not.
- [x] Every `toolbar` command also has a `menu`.
- [x] Commands panel and phone `⋯` show File (and the rest of the tree). Desktop File is not a local-only merge.
- [x] Overview and Organizer have a command row (File + panel toggle + `⋯` below `md`).
- [x] Same command, same label and icon on menu / toolbar / panel / palette / context menu.
- [x] Unavailable commands stay visible and disabled with the specific reason.
- [x] `navigation.md` (and the short pointers in `ux-principles.md` / `data-grid.md`) state the catalog rule, File, toolbar ⊂ menus, and the Go-to exception.
- [x] `test:unit` (2067), typecheck, lint, and browser verification at 1280×800 and 390×844. No `src/app/**` change, so smoke was not required.

## Changes from original plan

Material refinements during implementation (requirements, design, scope). Omit pure code polish.

| #   | Change                                                                           | Why                                                                                                                                                                                                            |
| --- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `CommandBar` merges `useCommands()` into the desktop menu list, last id winning. | ViewPicker publishes Save / Save as on its own. Those reached `⌘K` and the panel but not the desktop View menu — the same catalog hole as the File commands. A prop-only bar cannot see sibling registrations. |
| 2   | Extracted `DestinationCommandBar` for Journal, Overview, and the organizer.      | Three empty `TabToolbar` + `CommandBar` + `⋯` assemblies would have been three places for File to go missing.                                                                                                  |

---

## Task 1: Save spec documentation

Create `agent-os/specs/2026-08-13-1050-menu-completeness/` with:

- **plan.md** — this plan, **Status: active**, empty Changes table
- **shape.md** — scope, decisions, product alignment, visuals: none
- **standards.md** — applied rules from navigation, ux-principles, data-grid, responsive, testing, clean-code, commits
- **references.md** — governing specs and code pointers

No new visuals.

## Task 2: Update the standards

Rewrite the command-surface sections of `agent-os/standards/components/navigation.md`:

- Roles table: menu bar = catalog; toolbar = high-frequency subset; Commands panel = same tree left open; palette = searchable overlay + Go-to extras.
- **Menus are the source of truth.** A command without `menu` is not shipped (exception: `group: "go"`).
- **Toolbar ⊂ menus.** Every toolbar item is a menu command because the icon row is hidden below `md`.
- File menu contents and leftmost position. Tools stays the per-view extras menu.
- Palette extras are Go-to only. Settings / capture / Plan Week / Sign out are File, not extras.
- Same label, icon, action everywhere. Disable, do not remove.
- View ▸ Command palette is the discoverable invocation, in addition to the sidebar hint.

Align the short “getting between views / finding commands” paragraph in `ux-principles.md`. Update `data-grid.md`’s three-tier table so the menu-bar row is the complete catalog.

Re-run `/index-standards` only if descriptions in `index.yml` need a one-line update.

## Task 3: File menu in the command model

- Add `"file"` as the first entry in `COMMAND_MENUS` / `COMMAND_MENU_LABELS`. Add `MENU_SECTIONS.file`.
- Give the five `app.*` commands `menu: "file"`. Leave `go.*` without `menu`.
- Extract a pure placement list into `src/lib/commands/` so the completeness test lives in `src/lib`.
- Register the File commands once at the shell so `CommandsPanel` and `OverflowMenu` see them.
- `CommandBar` merges the same File commands into the list it passes to `CommandMenuBar` this render.
- Add **View ▸ Command palette** next to Show/Hide commands panel.
- Unit tests: File is leftmost; `go.*` never appears in `buildMenus`; File appears in `overflowMenus`; `unplacedCommands` reports a non-`go` command with no `menu`.

## Task 4: File on every AppShell destination

Pages that already have `CommandBar` inherit File from Task 3.

Add a command row to destinations that have `AppShell` but no `CommandBar` today. Pattern: Journal’s empty `CommandBar` + `TabToolbar` + pinned `⋯`.

Known gaps:

- **Overview** — File + panel toggle. Do not turn the five-step workflow links into menu items.
- **Organizer** — same chrome. Organizer outcomes stay on the page.

Do **not** add a command row to focused flows. Settings stays outside the shell.

Below `md`, `⋯` must exist on Overview and Organizer so File is tappable.

## Task 5: Completeness audit

Walk every `useRegisterCommands` site and every visible verb. Assign `menu` / `section` to anything missing one (except `go.*`). Register orphan buttons. Add `expect(unplacedCommands(commands)).toEqual([])` in `src/lib` builder tests.

## Task 6: Toolbar and label pass

Keep create / insert / open / rename on the icon row. Do not promote File items there. One string per `id`. Same glyph on every surface. Unavailable stays visible and disabled.

## Task 7: Verify, freeze spec, update roadmap

- `npm run test:unit`; typecheck; lint.
- Browser at 1280×800 and 390×844.
- If `src/app/**` changed: `npm run smoke`.
- Freeze the spec. Update the roadmap.

### Follow-ups (not this spec)

- Customisable icon row (Quick Access).
- Rebindable shortcuts.
- New ▾ split button.
- A Help menu.
- Command row on focused flows.
