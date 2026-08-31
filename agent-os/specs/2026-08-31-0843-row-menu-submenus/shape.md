# Compact row-menu submenus — Shaping Notes

**Status: active**

## Scope

Shorten the Outline (and every other grid’s) right-click menu by nesting the families that
dominate it, without burying Open / Complete / Cut / Paste / Delete.

The previous slice (`2026-08-06-1506-right-click-completion`) added submenus, but only for
value-pickers (`Convert to`, `Insert row`, `State`, `Rank`, `Expand`, `Priority`, `Zoom`).
`Item` and `Move` were left flat on purpose. Item then grew to twelve verbs, Move to five
plus Move to…, and Expand / Priority / Zoom still show a heading plus one row on the row
menu because their siblings were never opted into `rowMenu`. The result is a menu taller
than the viewport.

### Out of scope

- Undo / Redo, Record Work / Expenses, paste-as-duplicate.
- Nesting `Item` or `Danger`.
- Commands panel folding (it stays the tree left open).
- New verbs, other than taking Select all off the row menu.
- Outline-only exception to the one-shape rule.
- A dedicated viewport-clamp bugfix unless shortening is not enough.

## Decisions

Made with the user in plan mode, 2026-08-31:

1. **Achieve-shaped compact**, not “fold every current section” and not “only nest Move”.
   Frequent verbs stay at the top; Move, Go, Expand and Zoom nest; Select all leaves the
   row menu.
2. **Same folds everywhere** — row menu, menu bar, `⋯`. Commands panel still expands
   nested families as headed groups.
3. **Do not nest `Item`.** That would also collapse Item ▾. Split View tasks / View
   project / View in Outline into a new `Go` section instead.
4. **Supersede “Move stays flat”** for Move only. Five movement verbs dominate the list
   the way Convert to’s five kinds used to. Delete stays visible.
5. **One-command un-nested sections lose their heading** in `menuItemsFor` (row menu and
   menu bar). The Commands panel keeps the heading.

## Context

- **Visuals:** `visuals/outline-row-menu-before.png` — the user’s capture of the current
  Outline row menu overflowing the screen (gitignored; see `references.md`). Achieve’s
  outline menu, with `Insert ▸` / `Outline ▸` / `Actions ▸`, is already in
  `agent-os/specs/2026-08-06-1506-right-click-completion/visuals/achieve-outline-row-menu.png`.
- **References:** see `references.md`.
- **Product alignment:** `mission.md` — default when ambiguous is Achieve; modern UX on
  that model. This is compaction of an existing catalog, not new workflow.

## Standards Applied

- `components/navigation.md` — folding rule (this spec amends the Move sentence),
  unavailable-not-absent, one shape, Commands panel stays expanded.
- `components/data-grid.md` — `rowMenu` contract; placement on the command.
- `components/ux-principles.md` — nothing mouse-only; shortcuts print on nested members.
- `components/responsive.md` — compact sheet already drills into submenus.
- `development/testing.md` — pure logic beside the module; no React component tests.
- `development/commits.md` — Spec trailer on this folder.
