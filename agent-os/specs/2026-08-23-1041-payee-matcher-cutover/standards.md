# Standards for Payee matcher cutover

**Status: frozen / complete** (2026-08-23)

Applied as of standards commit `4dcdf3e`. References, not copies — see AGENTS.md.

- `agent-os/standards/database/migrations.md`
- `agent-os/standards/development/clean-code.md`
- `agent-os/standards/development/testing.md`
- `agent-os/standards/development/security.md`
- `agent-os/standards/development/commits.md`
- `agent-os/standards/api/agent-tools.md`
- `agent-os/standards/components/data-grid.md`
- `agent-os/standards/components/drawer-pattern.md`
- `agent-os/standards/components/modal-pattern.md`
- `agent-os/standards/components/ux-principles.md`
- `agent-os/standards/components/navigation.md`
- `agent-os/standards/components/responsive.md`

## Why these standards apply

- The database migration is a generated, staged, data-preserving cutover.
- Every query and mutation is user-scoped and finance data must not cross identities.
- Pure migration/matching logic needs adjacent tests; database behavior needs real-Postgres
  integration coverage including a second user.
- Agent contracts move from human matcher strings to stable ids with explicit legacy
  exposure and compact outputs.
- Payees and commitments remain shared DataGrids with drawer/sheet editing, command-registry
  operations and a confirmation modal for merge.
- Rename, merge and every picker must remain keyboard-first on desktop and touch-complete at
  390px, in both color schemes.

<!-- The standards text was formerly inlined here. It lives in agent-os/standards/
     and, as it stood at freeze, in `git show 4dcdf3e:agent-os/standards/<path>.md`. -->
