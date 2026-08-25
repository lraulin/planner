# Standards — budget funding indicators

**Status: frozen / complete** (2026-08-25)

Canonical standards are referenced rather than copied so this spec does not fork their
instructions. Read these before implementation:

- [`agent-os/standards/components/ux-principles.md`](../../standards/components/ux-principles.md) —
  the grid is for scanning; Assigned stays an inline number; no extra inspector modal.
- [`agent-os/standards/components/data-grid.md`](../../standards/components/data-grid.md) —
  one DataGrid; the bar and copy live in the name column `render`. Group headers do not
  get indicators. Hierarchy, sort, and filter are untouched.
- [`agent-os/standards/components/responsive.md`](../../standards/components/responsive.md) —
  compact primary cell carries bar + copy; Available is a meta chip; 44px tap on the pill;
  long-press still opens cover/move.
- [`agent-os/standards/development/testing.md`](../../standards/development/testing.md) —
  state machine in `src/lib/**` with `indicator.test.ts`; no React tests.
- [`agent-os/standards/development/clean-code.md`](../../standards/development/clean-code.md) —
  lib never imports app; one function so columns cannot drift from Assign.
- [`agent-os/standards/development/dates.md`](../../standards/development/dates.md) —
  month keys and `nextDueKey`; viewed month is a parameter, never the server clock.
- [`agent-os/standards/development/commits.md`](../../standards/development/commits.md) —
  one logical change per commit; Spec trailer to this folder.

Repository-level requirements in [`AGENTS.md`](../../../AGENTS.md) also govern Actual
Budget reference use, spec lifecycle, tests, and smoke verification.
