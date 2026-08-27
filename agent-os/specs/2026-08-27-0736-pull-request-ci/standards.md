# Standards for Pull-request CI

Applied as of standards commit `ec237181462bdf527917f6795e250ce665956efb`. References, not
copies — see AGENTS.md. Recover exactly what applied with
`git show ec23718:agent-os/standards/<path>`.

- `agent-os/standards/development/testing.md` — the standard this spec changes. It documents
  the gates and the loud-skip tolerance; both need updating, because there is now a third gate
  and one place where a skip must become a hard failure (Task 3, Task 5).
- `agent-os/standards/database/migrations.md` — CI applies migrations to an empty database on
  every run. Its rule that `db:push` is destructive and that migrations belong to the build is
  why the workflow calls `db:migrate`.
- `agent-os/standards/development/security.md` — a workflow on a **public** repo is a new
  execution surface. Two constraints follow: least-privilege `permissions` on the job, and no
  secrets, which the ephemeral Postgres service makes easy to honor. `pull_request` (not
  `pull_request_target`) keeps fork code out of a privileged context.
- `agent-os/standards/development/commits.md` — the workflow file and the standard edits land
  as separate logical commits with the canonical Spec trailer.

## Deviations

**CI does not run through `scripts/gate.sh`.** Every other gate in this repo does. `gate.sh`
exists to keep a passing gate silent, because agent sessions pay tokens to read hook output —
a concern that does not exist in CI, where nobody reads a green log and a failure needs its
full context, not a 60-line tail. The workflow calls the npm scripts directly.
