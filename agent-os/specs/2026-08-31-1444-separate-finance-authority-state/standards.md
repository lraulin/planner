# Standards

**Status: frozen / complete** (2026-08-31)

Standards were selected with `agent-os/standards/index.yml` and are pinned to repository
commit `5ac7a20e7273d4efa20365d329f364c48f059f82`.

- `agent-os/standards/database/migrations.md` — generate and inspect the SQL, snapshot, and
  journal together; apply through the direct database connection.
- `agent-os/standards/development/clean-code.md` — correct the model, keep rules in small
  concept-named library modules, and preserve layer direction.
- `agent-os/standards/development/testing.md` — test pure rules beside their modules and
  database behavior against real Postgres with cross-user isolation.
- `agent-os/standards/development/security.md` — retain explicit `userId` ownership on every
  query and mutation.
- `agent-os/standards/development/commits.md` — record the root cause, verification, and
  canonical spec link in the implementing commit.

No deviations are planned.
