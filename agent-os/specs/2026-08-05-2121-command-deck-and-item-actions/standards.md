# Standards applied

**Status: frozen / complete (2026-08-05)**

This slice follows:

- `agent-os/standards/components/navigation.md`: one command registry, complete palette, short
  contextual More menu, no palette-only command.
- `agent-os/standards/components/data-grid.md`: capability-aware shared grid, hierarchy survives
  view narrowing, and hidden rows do not change tree mutation semantics.
- `agent-os/standards/components/ux-principles.md`: command labels use user verbs; dialogs are
  reserved for destructive confirmation and choices the app cannot safely infer.
- `agent-os/standards/components/responsive.md`: mobile More path, 44px targets, no horizontal
  page overflow, and touch-safe command access.
- `agent-os/standards/components/modal-pattern.md`: conversion and zoom selection dialogs use
  `ModalShell` when introduced.
- `agent-os/standards/development/testing.md`: pure logic beside its source; database mutation
  tests include cross-user read/change/delete isolation; no React component tests.

The visual implementation also follows the frontend-design guidance: use the existing palette and
typography, spend the one visual risk on the selection/type accent, and keep motion/decorative
chrome subordinate to the planning task.
