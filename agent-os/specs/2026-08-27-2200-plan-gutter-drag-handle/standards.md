# Standards — Plan-module grab bar and live drag ids

**Status: frozen / complete** (2026-08-27)
Standards pinned at commit `91b94c63894ceb565c206327847af2185a9b194d` —
`git show 91b94c6:agent-os/standards/<path>` recovers exactly what applied.

Canonical standards are referenced rather than copied so this spec does not fork their
instructions.

- [`agent-os/standards/components/data-grid.md`](../../standards/components/data-grid.md) —
  "Drag-to-reorder is a feature, not a fallback"; desktop-only; never the only path to an
  outcome. This spec adds **The left gutter** to that section: the two modes, and the rule
  that a grid offering row drag puts no control in its gutter.
- [`agent-os/standards/components/navigation.md`](../../standards/components/navigation.md) —
  the selection is the rows on screen, reduced to roots; `⌘A` is an Item command, which is
  what lets the Plan module drop the header checkbox without losing select-all.
- [`agent-os/standards/components/responsive.md`](../../standards/components/responsive.md) —
  drag is mouse-shaped and off below `md`; the compact checkbox and its 44px tap target stay
  on every grid, Plan included.
- [`agent-os/standards/components/ux-principles.md`](../../standards/components/ux-principles.md) —
  consistency within a module beats uniformity across unrelated ones; a control that
  disables the module's primary gesture is not consistency.
- [`agent-os/standards/development/clean-code.md`](../../standards/development/clean-code.md) —
  "When the model is wrong, change the model." Here the model was right and the _cache_ was
  wrong: a memo comparator that intentionally ignores a value the closure still reads.
- [`agent-os/standards/development/testing.md`](../../standards/development/testing.md) — no
  React component tests. Nothing moved into `src/lib`, so this ships without new tests; the
  drop resolvers it relies on (`lib/tree/dnd.ts`, `lib/tree/outlinePriority.ts`,
  `lib/grid/selection.ts`) are unchanged and already covered.
- [`agent-os/standards/development/commits.md`](../../standards/development/commits.md) —
  one logical change per commit; Spec trailer.

Repository-level requirements in [`AGENTS.md`](../../../AGENTS.md) also govern spec
lifecycle, `npm run smoke` after `src/app/**` changes, and fixing the cause rather than the
symptom.
