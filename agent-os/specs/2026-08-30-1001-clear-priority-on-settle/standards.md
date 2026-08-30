# Standards for Clear priority on settle

**Status: frozen / complete** (2026-08-30)

Applied as of standards commit `a48386634d73644cdac630eb99ed1ebd4aaef8ce`. References, not copies — see AGENTS.md. Recover a file with `git show a48386634d73644cdac630eb99ed1ebd4aaef8ce:agent-os/standards/<path>`.

- `agent-os/standards/development/testing.md` — the matrix is pure logic (`src/lib`, sibling test); the write is a mutation, so integration tests including a second user. Do not add React tests. Do not restate the implementation.
- `agent-os/standards/development/clean-code.md` — one module named for the concept; mutations ask it. `actions.ts` stays thin. Do not copy the table into drawer / day / organizer — they already share `applyStateTransition`.
- `agent-os/standards/development/security.md` — every write stays `userId`-scoped; a dropped `userId` on the new TC persist helper would be invisible without the cross-user case.
- `agent-os/standards/development/commits.md` — one logical change per commit; Spec trailer on the implementing commit; the spec is intent, the commit is how this diff arrived.
- `agent-os/standards/database/migrations.md` — the backfill is hand-written SQL `db:generate` cannot express (same class as `drizzle/0054_typical_steel_serpent.sql`). Regenerate the snapshot afterwards; commit `.sql` + snapshot + `_journal.json` together; production migrates during the build.

`product/date-model.md` was considered and **not** included: this work does not change state↔date coupling, `deferred_date`, or `date_completed`. Recurrence still owns those.

## Deviations

None.
