# References for Parallelize the test suite

## Governing specs

### `agent-os/specs/2026-08-12-1316-security-hardening-and-standard/`

- **Relationship:** Extends.
- **Relevant decision:** Decision 5 — "Dependabot, not CI. Husky already runs lint/typecheck/unit
  pre-commit and integration pre-push. The gap is dependency drift, which Dependabot closes
  directly." This spec keeps that decision and repairs its premise: pre-push did _not_ reliably
  run the integration tests, because they skipped whenever Docker was down.

### `agent-os/specs/2026-08-10-1940-daily-use-performance/standards-testing.md`

- **Relationship:** Extends.
- **Relevant decisions:** Source of the current `development/testing.md`, including the Mechanics
  table and the loud-skip rationale. Both need updating here to match the new gate behavior.

### `agent-os/specs/2026-08-20-1115-timed-isometric-exercises/`

- **Relationship:** Background only, no dependency.
- **Why it matters:** Records a real incident where a date-dependent integration test
  (`src/lib/day/mutations.integration.test.ts`) blocked pre-push once its hard-coded shelf date
  arrived. Evidence that date-dependent tests exist here, relevant to the test-count observation
  at the end of `plan.md`.

## Code touched or studied

### `vitest.config.ts`

- **Relevance:** Holds the root cause. `fileParallelism: false` at line 14, with a comment about
  integration tests sharing one database, applied project-wide.
- **Origin:** commit `4501712` "Add tree query and mutation layer" — the commit that introduced
  integration testing. The flag was correct-ish for a handful of files and never rescoped.
- **Must survive the rewrite:** the `TZ` pin and its comment, the `@` alias, `environment: node`,
  and the `dotenv` load of `.env.local`.

### `src/lib/testing/database.ts`

- **Relevance:** `databaseReachable()` and `warnDatabaseSkipped()` — the skip path being made
  unreachable at push time. Its own comment explains why an unreachable database skips while an
  unset `DATABASE_URL` throws; that distinction stays.

### `src/lib/finances/tags/mutations.integration.test.ts`

- **Relevance:** Representative of all 54 integration files. Creates its own owner and intruder
  users with `crypto.randomUUID()` emails in `beforeAll`, deletes them in `afterAll`. This
  per-file user scoping is what makes parallel execution safe, and it is universal — every one of
  the 54 files uses `randomUUID`.

### `src/db/index.ts`

- **Relevance:** Builds the `postgres()` client at the library default `max: 10`, cached on
  `globalThis` outside production. Each Vitest worker gets its own pool, which is why the
  connection ceiling scales with worker count. Explicitly _not_ to be modified — the bound
  belongs on the runner.

### `scripts/gate.sh`

- **Relevance:** Silent on success, `tail -60` on failure; already collapses the 54 skip warnings
  to one line. Its failure output is the thing to re-verify once workers interleave.

### `.husky/pre-commit` / `.husky/pre-push` / `docker-compose.yml`

- **Relevance:** pre-commit is already unit-only and stays untouched. pre-push gains the
  `docker compose up -d --wait` step, which works because the compose file defines a `pg_isready`
  healthcheck (5s interval, 10 retries). Both hooks carry comments that will be stale afterward.
