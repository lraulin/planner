# Pull-request CI — Shaping Notes

**Status: frozen / complete** (2026-08-27)

## Scope

A single GitHub Actions workflow that runs on `pull_request` only: Postgres service, migrate
from empty, lint, typecheck, full test suite. It exists to cover the one class of branch the
git hooks structurally cannot reach — branches that never touch Lee's machine.

### Out of scope

- **CI on `push`.** It would duplicate the pre-push hook on every push and report after the
  Vercel deploy had already started. The frozen `2026-08-26-2242` reasoning holds for pushes;
  this spec does not disturb it.
- **`next build` in CI.** Vercel's preview deployment already builds every PR and reports as a
  check. Verified during shaping: `gh pr checks 5` shows it, currently failing.
- **`npm run smoke` in CI.** Considered — it is the check that would most directly catch a
  major dependency bump breaking at render time, which lint, typecheck and build all miss. It
  needs a seeded dev user, `AUTH_DEV_BYPASS`, and a running `next dev`. Deferred as its own
  change rather than bundled into the first workflow.
- **Dependabot auto-merge.** Declined for now; a later one-liner if the signal proves good.
- **A branch/PR workflow for Lee's own work.** Declined — see Decisions.
- **PR #6's view-model rework.** Abandoned as a branch; see Decisions.
- **Changing the hooks.** `.husky/pre-commit` and `.husky/pre-push` are untouched.

## Decisions

- **`pull_request` only.** This is what makes CI cheap here rather than redundant. Every
  objection recorded in the two governing specs — duplicate work, async reporting behind a
  deploy, agent token cost from polling runs — applies to `push` CI and none of it applies to a
  job that only ever fires on a PR.
- **Migrate rather than push the schema.** `db:migrate` mirrors production and, as a side
  effect, makes CI the only place the full 79-migration chain is ever applied to an empty
  database. Vercel only applies pending ones.
- **CI must not be able to skip the database tests.** `databaseReachable()` skipping loudly is
  right for a developer with Docker down and wrong in CI, where it converts a broken service
  container into a green build. Repeating the exact failure `2026-08-26-2242` was written to
  close would be the worst possible outcome of adding a gate.
- **No branch/PR workflow for ordinary work.** One dev, one machine. The only advantage with
  real weight is a Vercel preview to validate on the phone before production — and it is
  hollower than it looks: `scripts/migrate-on-deploy.mjs` guards migrations on
  `VERCEL_ENV === "production"` and previews share the single Neon database, so a preview of a
  branch carrying a migration queries columns that do not exist, which is exactly the case worth
  previewing. Weighed against a 2–3 minute wait added to every change on a repo Lee pushes to
  many times a day, and against the recorded experience that branch-parked work reads as a
  broken feature on the phone. Branches stay situational: a migration worth staging, a refactor
  worth reverting wholesale, two agents running at once.
- **PR #6 is abandoned, branch and all.** Lee's initial instinct was to finish it; the shaping
  evidence changed the call and he confirmed abandoning it. It is 278 commits behind, none of it
  landed, and the spec governing the area
  (`2026-08-13-0940-custom-view-working-set`) was frozen 2026-08-25 — eleven days _after_ the PR
  opened — with the built-in/user view split that the PR exists to remove still intact. Merging
  it would silently overwrite a frozen model. The PR also edits that spec's `plan.md`, the
  `components/data-grid.md` standard, and `tsconfig.json`. Whether the unified-view behavior is
  still wanted is a separate, open question; if it is, it is a delta spec against the views spec,
  not this branch.

## Context

- **Visuals:** None.
- **Evidence gathered during shaping:**
  - `gh pr list --state all` — 5 open Dependabot PRs, 0 ever merged, plus Copilot's #6. No
    check has ever run lint, typecheck or tests against any of them.
  - `gh pr checks 5` — Vercel status present and **failing** on `@fullcalendar/react` 6 → 7.
  - `lraulin/planner` is **public**, so Actions standard runners are unmetered. Cost is zero.
  - Tests need only `DATABASE_URL` and a migrated schema — `vitest.config.ts` injects
    `DATABASE_URL` and `TZ`, and integration tests create their own users. No secrets in CI.
  - Local Node v24.19.0; no `.nvmrc`, no `engines` field.
- **References:** see `references.md`.
- **Product alignment:** N/A — infrastructure. No roadmap item expected, consistent with how
  `2026-08-26-2242` handled the same question.

## Standards Applied

See `standards.md`. In short: `development/testing.md` because this adds a third gate to the
two it describes and changes when a skip is tolerated; `development/security.md` because a
workflow on a public repo is a new execution surface; `database/migrations.md` because CI
applies the chain to an empty database.
