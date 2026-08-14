# Standards for View in Outline

**Status: frozen / complete** (2026-08-14)

The following standards apply to this work. File references, not full copies.

@agent-os/standards/components/navigation.md
@agent-os/standards/components/data-grid.md
@agent-os/standards/components/ux-principles.md
@agent-os/standards/development/testing.md
@agent-os/standards/development/clean-code.md
@agent-os/standards/development/commits.md

These cover:

- Menus are the catalog; a command without `menu` is not shipped (except `go.*`). Same
  label, icon, and action on every surface. Unavailable is disabled with the reason, never
  removed.
- One shared DataGrid and one command deck. Hosts declare capabilities; they do not
  hand-write a second row menu.
- Selection is the subject of item verbs. Keyboard-first; no palette-only command.
- Pure logic in `src/lib/**` with a sibling test. No React component tests. A test earns
  its place if it would fail on a plausible mistake.
- `app → components → lib → db`. One implementation per concern (`?select=` next to
  `?detail=`; reveal helpers next to `walkUp` / `zoom`).
- One logical change per commit. Imperative subject under 72 characters. Spec trailer:
  `Spec: agent-os/specs/2026-08-14-1142-view-in-outline`.
