# Pull-request CI

**Status: active**  
Spec folder: `agent-os/specs/2026-08-27-0736-pull-request-ci/`

## Spec relationships

- **Supersedes:** `agent-os/specs/2026-08-12-1316-security-hardening-and-standard/` — decision
  5, "Dependabot, not CI", **only its "not CI" half**. Dependabot stays exactly as configured.
  The premise that failed is "Husky already runs lint/typecheck/unit pre-commit and integration
  pre-push": true for Lee's commits, false for the branches Dependabot itself opens.
- **Extends:** `agent-os/specs/2026-08-26-2242-parallel-test-suite/` — keeps hooks as the gate
  for pushes and keeps the push-time database gate intact. That spec listed "Adding CI" out of
  scope, to "revisit only if the hooks stop being sufficient." This is the revisit, with a
  different trigger than the one anticipated: not that the hooks became insufficient, but that
  a class of branch exists which hooks structurally cannot reach.

## Context

Every gate in this repo is a git hook on Lee's machine: `.husky/pre-commit` runs
lint/typecheck/unit, `.husky/pre-push` starts Postgres and runs the full suite. That covers
every commit **that originates here** — and nothing else.

Six PRs are open on `lraulin/planner` at shaping time. Five are Dependabot's; two of those are
major bumps (`@fullcalendar/core` and `@fullcalendar/react` 6 → 7). Not one has had lint,
typecheck, or a single test run against it, because a Dependabot branch never touches this
machine and so never fires a hook. The choices today are "pull it down and run the suite by
hand" or "merge on faith."

This adds a `pull_request`-only CI job to close that gap, and deliberately nothing more.
Pushes to `master` keep going straight to Vercel with the hooks as their gate — CI on push
would only duplicate the hook and report after the deploy had already started.

Two findings sharpened the design:

- **Vercel already checks PRs.** `gh pr checks 5` shows a Vercel deployment status, currently
  **failing** on the fullcalendar 7 bump. So `next build` coverage on PRs exists; CI should
  not repeat it. What is missing is lint, typecheck, and the tests.
- **Nothing has ever applied the migration chain from empty.** Vercel applies only _pending_
  migrations to a database that already exists. A CI job that migrates a fresh Postgres
  exercises all 79 from zero on every run, for free.

GitHub Actions costs nothing here: the repo is public, so standard runners are unmetered.
Postgres runs as a service container, so no secrets are involved and fork PRs work.

## Decisions

- **`pull_request` only, never `push`.** Avoids every cost that made CI unattractive: no
  duplicate run behind each push, no race with the Vercel deploy, no run status for an agent to
  poll on ordinary work. `workflow_dispatch` is included so a run can be triggered by hand.
- **No `next build` step.** Vercel's preview deployment already builds every PR and reports as
  a check. Adding it here would burn 90s to learn the same thing twice.
- **Migrate with `db:migrate`, not `db:push`.** It is what production does, and it makes the
  full chain-from-empty a thing that gets verified. `db:push` is destructive and skips the
  chain entirely (`agent-os/standards/database/migrations.md`).
- **The database gate must be unskippable in CI, for the same reason it is unskippable on
  push.** `databaseReachable()` returns `false` and the suite reports green when Postgres is
  unreachable — correct for a developer with Docker down, catastrophic in CI, where it would
  turn a broken service container into a passing build. That is precisely the failure the
  parallel-test-suite spec closed for pushes; do not reintroduce it here.
- **No Dependabot auto-merge.** CI reports; Lee merges. Auto-merge is a later one-liner once
  the signal is trusted.
- **No branch/PR workflow for Lee's own work.** Considered and declined during shaping. Push to
  `master` stays the default; a branch is for a specific reason (a migration worth staging, a
  refactor worth reverting wholesale, two agents running at once), not a policy. Preview deploys
  are the one real draw and they are weaker here than they look: `scripts/migrate-on-deploy.mjs`
  guards migrations on `VERCEL_ENV === "production"` and previews share the single Neon
  database, so a preview of a branch that adds a migration queries columns that do not exist.
- **PR #6 (Copilot, "Unify shipped and user views") is abandoned and closed.** See Follow-ups.

## Acceptance criteria

- [x] Opening or synchronizing a PR against `master` runs one `ci` check that fails on any lint
      error, type error, or failing test — verified through `workflow_dispatch`, which runs the
      identical job. Two of the three runs failed, on lint and then on tests, before the third
      went green
- [x] The job applies all 79 migrations to an empty Postgres and fails if any will not apply —
      `npm run db:migrate` passes on every run against the fresh service container
- [x] A job whose Postgres service is unreachable **fails**; it cannot report green with the
      integration tests skipped — `docker compose down && CI=true npm run test:integration`
      fails all 54 files, each naming the unreachable database
- [ ] Each of the five open Dependabot PRs shows a pass or fail from the new check — **pending**,
      see Task 6. Needs `@dependabot rebase` on #2, #3, #4, #5, #7 to synchronize them
- [x] Pushing to `master` is unchanged: no CI run, hooks untouched, Vercel untouched —
      `gh run list` shows no `CI` run from any of the four pushes, only the manual dispatches
- [x] Job wall time under 4 minutes — 2m50s green (1m36s and 1m46s on the two failing runs)

## Changes from original plan

Material refinements during implementation (requirements, design, scope). Omit pure code polish.

| #   | Change                                                                                                     | Why                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| --- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Two fixes to `master` landed that the spec did not anticipate, because CI found them on its first two runs | The gate cannot be called working while `master` is red, and both were real defects the hooks had never been able to see. (a) The three `src/app/.well-known/**` routes were outside the TypeScript program on a clean checkout — TS wildcards skip dot-directories, and locally they were dragged in only through the generated `.next/types`. They had been unlinted and untypechecked since they were added. (b) Two unit tests failed with "Google is not connected": the only `vi.mock` in the unit suite, leaking under `--no-isolate` when file-to-worker distribution puts a real import of the module first. Reproduces locally at `maxForks=2`; CI runners have fewer cores. Fixed by extracting `buildUpdatePatch` as pure logic and deleting the mock. |
| 2   | Verified with `workflow_dispatch` on `master` rather than by opening a PR                                  | `workflow_dispatch` was already in the design as a manual trigger, and it exercises every step of the job identically. Three runs: red on lint, red on tests, then green.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 3   | Node major recorded: `.nvmrc` says 24, Vercel's project is set to 24.x, local is v24.19.0                  | Task 4 asked for the check. They agree; nothing to resolve.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 4   | `actions/checkout` and `actions/setup-node` pinned at `v7`, not the `v6` the shaping notes assumed         | v7 is the current major of both.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

---

## Task 1: Save spec documentation

Create `agent-os/specs/2026-08-27-0736-pull-request-ci/` with `plan.md` (this plan, **Status:
active**), `shape.md`, `standards.md` (pinned at standards commit `ec23718`), `references.md`.
No visuals.

## Task 2: Add `.github/workflows/ci.yml`

One job, `ubuntu-latest`. Shape:

- `on: pull_request: { branches: [master] }` plus `workflow_dispatch`
- `permissions: { contents: read }` — nothing here writes to the repo
- `concurrency: { group: ci-${{ github.ref }}, cancel-in-progress: true }` so a Dependabot
  rebase supersedes its own in-flight run
- `services.postgres`: `postgres:17-alpine`, user/password/db all `planner` to match
  `docker-compose.yml`, `--health-cmd pg_isready` options so steps start against a live server
- `actions/setup-node` with `node-version-file: .nvmrc` and `cache: npm`
- Steps: `npm ci` → `npm run db:migrate` → `npm run lint` → `npm run typecheck` → `npm test`
- `env.DATABASE_URL: postgresql://planner:planner@localhost:5432/planner`, job-level

Call the npm scripts directly rather than through `scripts/gate.sh`: that script exists to keep
a passing gate silent for agents reading hook output, and CI wants the full log on failure.

`npm test` chains `test:unit` then `test:integration` for the reason in `vitest.config.ts` —
isolation and worker count are per-process, not per-project. Do not collapse it to one vitest
invocation in CI.

## Task 3: Make the database skip impossible in CI

In `src/lib/testing/database.ts`, when the probe fails and `process.env.CI` is set, throw
instead of returning `false`. The comment there already draws the distinction this needs — an
unreachable database "should never block a commit" — so extend that reasoning rather than
replacing it: unreachable is a developer convenience locally and a broken workflow in CI.

`npm run db:migrate` running first means a dead service container already fails the job before
the tests start. This is the second lock on the same door, and it is worth having because the
first one is incidental.

## Task 4: Add `.nvmrc`

Local Node is v24.19.0; there is no `.nvmrc` and no `engines` field, so CI would silently pick
whatever `setup-node` defaults to. Write `24`. Check what Node major the Vercel project is set
to and note it here — if they disagree, that divergence is worth knowing about, though
resolving it is not this spec's job.

## Task 5: Update the testing standard and AGENTS.md

`agent-os/standards/development/testing.md` describes the gates; there are three now, not two,
and the third one runs somewhere Docker is not Lee's. Update the Mechanics table and the
skip-tolerance wording to match Task 3. Mirror the one-line change in the AGENTS.md tests
section — it currently says the pre-push hook is the thing that stops a skip sliding through.

Keep both edits small. The standard describes the gate; it does not document the workflow file.

## Task 6: Prove it on the real PRs

A `pull_request` workflow runs from the base branch, so the five open Dependabot PRs will not
pick it up until each is synchronized. Comment `@dependabot rebase` on each to trigger a push,
then read the results.

Merge what is green. For anything red, record here what failed — the fullcalendar 7 pair
already fails Vercel's build, so a red CI result there is expected and confirms the check works
rather than indicating a problem to fix.

## Task 7: Verify, freeze spec, update roadmap

- Confirm every acceptance criterion, including the negative one: a push to `master` triggers no
  Actions run
- Complete **Changes from original plan**
- Mark `plan.md` and `shape.md` **Status: frozen / complete** (date)
- Roadmap: N/A — infrastructure, no roadmap item expected

## Follow-ups (new work — not amendments to this spec)

**PR #6, `copilot/remove-built-in-views`** — 942 additions across 28 files, opened 2026-08-14,
now **278 commits behind master** with none of it landed. It removes the shipped-vs-user view
split, and the spec governing that area,
`agent-os/specs/2026-08-13-0940-custom-view-working-set/`, was **frozen 2026-08-25** — after the
PR was opened — with that split intact. The branch also edits that frozen spec's `plan.md`,
`agent-os/standards/components/data-grid.md`, and `tsconfig.json`.

**Closed 2026-08-27** on Lee's decision, branch abandoned. Merging it would have silently
overwritten a frozen model with a lower-tier model's rewrite.

Whether the unified-view behavior is still wanted is left open. If it is, it is a delta spec
against `2026-08-13-0940-custom-view-working-set/`, shaped from the PR description as a statement
of intent and implemented fresh against current `master` — not a resurrection of the branch.

## Verification

```bash
# Locally, before opening the PR — the same sequence CI runs, against the dev container:
docker compose up -d --wait
npm run lint && npm run typecheck && npm test

# Task 3, the part that matters: the suite must FAIL, not pass with skips.
docker compose down
CI=true npm run test:integration     # expect failure naming the unreachable database
docker compose up -d --wait

# End to end: open a PR with the workflow on it and watch the check.
gh pr checks <n> --watch

# The negative criterion, after merge to master:
gh run list --limit 5                # a plain push to master must add no run
```

---

**Standing rule while this spec is active:** when a material change to requirements, design, or
scope arrives (including feedback on what was implemented), update the relevant sections above
and append a row to **Changes from original plan**. Skip pure implementation details. Freeze
when verified.
