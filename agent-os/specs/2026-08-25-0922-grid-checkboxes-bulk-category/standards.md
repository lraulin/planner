# Standards — grid checkboxes, bulk Register category, Outline Move to…

**Status: active**

Canonical standards are referenced rather than copied so this spec does not fork their
instructions. Read these before implementation:

- [`agent-os/standards/components/data-grid.md`](../../standards/components/data-grid.md) —
  one DataGrid; `onNavigableIdsChange` is the selection order; hosts must not derive it.
- [`agent-os/standards/components/navigation.md`](../../standards/components/navigation.md) —
  plural verbs act on the on-screen selection reduced to roots; a command without a menu is
  not shipped; `⌘A` belongs in Item, not as a host-local listener.
- [`agent-os/standards/components/ux-principles.md`](../../standards/components/ux-principles.md) —
  consistency across grids; keyboard-first on desktop; immediate feedback (ErrorBanner /
  ConfirmDialog, not a toast stack we do not have).
- [`agent-os/standards/components/responsive.md`](../../standards/components/responsive.md) —
  44px tap targets below `md`; no hover; checkbox always visible.
- [`agent-os/standards/components/modal-pattern.md`](../../standards/components/modal-pattern.md) —
  Move to… picker and Set category… sit on ModalShell; ConfirmDialog for partial moves and
  bulk delete.
- [`agent-os/standards/development/testing.md`](../../standards/development/testing.md) —
  pure logic beside the file; DB mutations get a second-user isolation case; no component
  tests.
- [`agent-os/standards/development/security.md`](../../standards/development/security.md) —
  every mutation takes `userId` and scopes by it.
- [`agent-os/standards/development/commits.md`](../../standards/development/commits.md) —
  one logical change per commit; Spec trailer.
- [`agent-os/standards/product/date-model.md`](../../standards/product/date-model.md) — not
  the focus of this spec; do not disturb shelf/date coupling when `moveNode` re-syncs day
  lines.

Repository-level requirements in [`AGENTS.md`](../../../AGENTS.md) also govern spec
lifecycle, tests, and smoke verification after `src/app/**` changes.
