# Standards for command completeness

Full files stay in `agent-os/standards/`. What this work must honour, and what it amends.

## `components/navigation.md`

The standard this spec **amends**.

Carried forward:

- One registry, every renderer. A command described in two places eventually disagrees.
- Placement belongs to the command (`menu` / `section` / `icon` / `toolbar` / `rowMenu`).
- Unavailable is disabled with the specific reason, never absent.
- The row menu is the one narrow surface (`rowMenu` opt-in).
- `ownControl` means a lens widget is still on screen below `md`; `⋯` skips those only.
- `⋯` is the phone’s menu bar. Desktop has named menus.
- Shell state is a setting. Events, not a provider, for “open this.”

Amended by this spec:

- **Menus are the source of truth for completeness.** A command without `menu` is not shipped. The one exception is `group: "go"` (sidebar is the visual catalog; palette may list them as extras).
- **Toolbar ⊂ menus.** Every `toolbar` command has a `menu`. The icon row is hidden below `md`.
- **File** is the leftmost always-present menu for app-wide commands. Tools stays per-view extras.
- Palette extras are Go-to only. Settings / capture / Plan Week / Sign out are File.
- View ▸ Command palette is the menu invocation of `⌘K`.

## `components/ux-principles.md`

- Consistency across every view.
- Keyboard first on desktop, touch-complete on phone. A shortcut with no visible path fails on the phone.
- “A gesture nobody can see is not a discoverable action” — the reason menus, not the palette, are the catalog.
- The “getting between views / finding commands” paragraph still describes `⋯` as the desktop home. This spec rewrites that pointer.

## `components/data-grid.md`

- A tab declares what it has; it does not decide which surface a command appears on.
- Three-tier table: on the bar / in a menu / deleted. This spec restates the menu row as the **complete catalog**, not “occasional only.” Palette-only remains “Nothing.”
- Verbs and lens occupy separate rows.

## `components/responsive.md`

- Adaptive, not shrunken. Below `md` there is no command row and no `⌘K`; `⋯` is the menu bar.
- File must appear in `⋯` on every destination that has one, including Overview and Organizer.

## `development/testing.md`

- Completeness (`unplacedCommands`) lives in `src/lib` beside the builders.
- No React component tests. Verify the bar, panel, and `⋯` in a real browser.
- A test earns its place if it would fail on a plausible mistake: a new `app.*` command with no `menu`.

## `development/clean-code.md`

- One of each thing: one File menu, one `CommandBar`, one registry.
- `src/lib` holds placement and the invariant; components wire `run`.
- Do not invent a second menu tree for Overview.

## `development/commits.md`

- One logical change per commit. Imperative subject naming the effect.
- `Spec: agent-os/specs/2026-08-13-1050-menu-completeness`
- No AI attribution.
