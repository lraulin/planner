# Shared Command Deck and Item Actions — Shaping Notes

**Status: frozen / complete (2026-08-05)**

## Product intent

The command surface should feel like a small planning instrument: a quiet grid header, a single
selection/type-colored accent, and short verbs that stay stable wherever a command appears. The
deck is not a second navigation system. It answers “what can I do with this row right now?” while
the existing view controls answer “what am I looking at?”

## Decisions

- Keep the hand-rolled `DataGrid`, `GridToolbar`, `CommandProvider`, `OverflowMenu`, and
  `CommandPalette` architecture.
- Add `toolbarGroup`, `primary`, and capability-derived disabled state to the shared command
  descriptor; the registry remains the source for every surface.
- Keep destructive actions in More/row menus, with confirmation owned by the existing dialogs.
- Use existing type colors as the signature accent; no new font or app-wide redesign.
- Treat a filtered list as a view onto the full tree. Priority repair always receives the complete
  persisted sibling set on the server.
- Model Dream as Goal + `isDream`, so Goal ↔ Dream conversion retains the Goal detail row.
- Conversion hoists to the nearest legal ancestor, but direct-child conflicts block before any
  write. Incompatible detail rows/history are removed inside the same transaction.
- Outline zoom is a URL `zoom` root, pushed into browser history. A stale root is cleared rather
  than leaving a blank or misleading outline.
- “Zoom to item…” searches the complete outline in a bottom-sheet/centered picker, and
  “Expand through level…” uses a single level picker instead of nine mobile menu rows.
- Projects, Goals, Tasks, and Result Areas reuse the same conversion/priority capability hook;
  their projection grids continue to omit structural move/indent commands because those actions
  intentionally belong to Outline.

## Visual direction

```
┌ New ▾ ───── ┬ Selected: 1  “Write brief” ─ Open  Rename ─┬ Organize ▾ ─ More ⋯ ┐
│ view / filters / fields remain in the same header and scroll on a phone            │
└ selection/type accent ─────────────────────────────────────────────────────────────┘
```

The primary New control is solid with a thin type-colored edge. Selection information is compact
and never competes with the view picker. On a phone the deck’s commands are reachable from More,
with 44px targets and the existing bottom-sheet menu.

## Explicit divergence from Achieve

The Win32 toolbar/panel arrangement is intentionally not reproduced. Achieve’s workflow semantics
(sibling-relative priority, hierarchy-aware inserts, Outline zoom) are retained behind modern
responsive surfaces.
