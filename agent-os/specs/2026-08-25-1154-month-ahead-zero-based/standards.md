# Standards — month-ahead zero-based budget

**Status: frozen / complete** (2026-08-25)

Canonical standards are referenced rather than copied so this spec does not fork their
instructions. Read these before implementation:

- [`agent-os/standards/development/clean-code.md`](../../standards/development/clean-code.md) —
  paycheck period and Hold were workarounds for not being a month ahead; correct the model.
  Keep demand and Ready to Assign arithmetic in `src/lib/**`.
- [`agent-os/standards/development/testing.md`](../../standards/development/testing.md) —
  named tests that would fail on half-a-monthly-bill or a double-counted future assignment;
  integration cross-user; no component tests.
- [`agent-os/standards/development/security.md`](../../standards/development/security.md) —
  every mutation takes `userId` and proves ownership.
- [`agent-os/standards/development/dates.md`](../../standards/development/dates.md) —
  month keys and `monthsUntilDate`; never `startOfDay` on a calendar field.
- [`agent-os/standards/development/commits.md`](../../standards/development/commits.md) —
  one logical change per commit; Spec trailer to this folder.
- [`agent-os/standards/components/ux-principles.md`](../../standards/components/ux-principles.md) —
  muted note when viewing a future month, not a blocking modal; Assign preview already exists.

Repository-level requirements in [`AGENTS.md`](../../../AGENTS.md) also govern Actual Budget
reference use, spec lifecycle, tests, and smoke verification.
