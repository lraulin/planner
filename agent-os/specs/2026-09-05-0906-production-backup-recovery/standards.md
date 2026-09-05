# Standards for Production Backup and Recovery

**Status: frozen / complete** (2026-09-05)

Applied as of standards commit `2f2f096df1dad2485a32aa5f6073b7576c7faebd`.
References, not copies.

- `agent-os/standards/development/security.md` — Keychain ownership, secret redaction,
  fail-closed behavior, and non-sensitive diagnostics.
- `agent-os/standards/development/testing.md` — pure retention/cost logic beside unit tests
  and real Postgres verification where the database matters.
- `agent-os/standards/development/clean-code.md` — operational rules live in small
  `src/lib/backup/` modules; the CLI remains wiring.
- `agent-os/standards/development/commits.md` — logical commits, useful recovery rationale,
  verification evidence, and the canonical spec trailer.
- `agent-os/standards/database/migrations.md` — direct production connections and the new
  pre-migration recovery gate for destructive/data-transforming changes.

## Deviations

None.
