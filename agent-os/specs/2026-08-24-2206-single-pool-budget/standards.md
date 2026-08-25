# Standards — one pool, every dollar assigned

**Status: frozen / complete** (2026-08-24)

Canonical standards are referenced rather than copied so this active spec does not fork their
instructions. Read these before implementation:

- [`agent-os/standards/development/clean-code.md`](../../standards/development/clean-code.md) —
  correct the shared account/pool model; keep arithmetic and eligibility out of components; do
  not retain parallel helpers with old vocabulary.
- [`agent-os/standards/development/testing.md`](../../standards/development/testing.md) — named
  pure tests for plausible arithmetic mistakes, database integration coverage, second-user
  isolation, and confirmation that Postgres tests actually ran.
- [`agent-os/standards/development/security.md`](../../standards/development/security.md) — every
  cutover, account read, and mutation is explicitly user-scoped and fails closed.
- [`agent-os/standards/development/commits.md`](../../standards/development/commits.md) — keep the
  model correction, generated migrations, and durable rationale reviewable and attributable.
- [`agent-os/standards/database/migrations.md`](../../standards/database/migrations.md) — generate
  SQL and metadata together, order the data cutover before the CHECK, and verify constraints
  against real data.
- [`agent-os/standards/components/ux-principles.md`](../../standards/components/ux-principles.md) —
  make the one-pool consequence and exact Ready to Assign terms understandable at the decision
  point; do not hide a consequential membership change behind vague copy.

Repository-level requirements in [`AGENTS.md`](../../../AGENTS.md) also govern Actual Budget
reference use, spec lifecycle, migrations, tests, smoke verification, and root-cause fixes.
