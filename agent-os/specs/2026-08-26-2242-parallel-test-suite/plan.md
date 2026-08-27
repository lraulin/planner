# Parallelize the test suite and make the integration gate unskippable

**Status: frozen / complete**  
Spec folder: `agent-os/specs/2026-08-26-2242-parallel-test-suite/`

## Context

The suite got slow enough to notice. Measured on this machine (12 CPUs, Postgres up):

| Suite                  | Now   | Parallel  | Parallel + no-isolate |
| ---------------------- | ----- | --------- | --------------------- |
| Unit (294 files)       | 43.9s | 9.1s      | **2.1s**              |
| Integration (54 files) | 48.0s | **10.4s** | —                     |
| Full `npm test` (348)  | 96.1s | **21.8s** | —                     |

**Root cause:** `vitest.config.ts:14` sets `fileParallelism: false` for the _entire_ project,
commented "Integration tests share one database, so run files serially to keep them isolated."
That line arrived in `4501712` ("Add tree query and mutation layer"), when integration tests
were first introduced and there were a handful of them. It was never scoped to them. It has
been serializing all 294 hermetic unit files ever since — files that never touch Postgres.

The premise it protects is also no longer true for the integration tests themselves. Every one
of the 54 files creates its own users with `crypto.randomUUID()` emails and deletes them in
`afterAll` (`src/lib/testing/database.ts` and e.g. `src/lib/finances/tags/mutations.integration.test.ts`),
so files do not contend for shared rows. Verified empirically: **4 consecutive parallel runs
passed 913/913**, peaking at **51 of 100** Postgres connections.

Only 1.56s of the original 43.9s unit run is actual test execution. The rest is per-file
transform/collect, serialized.

### Two corrections to the framing of the request

1. **The pre-commit hook already runs unit tests only.** `.husky/pre-commit` runs `lint`,
   `typecheck`, `test:unit`; `.husky/pre-push` runs the full suite. The split being asked for
   exists — it is just slow. No change to that boundary is needed.
2. **The real gap is downstream.** There is no CI (no `.github/workflows`), and integration
   tests _skip_ rather than fail when Postgres is unreachable. So a push with Docker stopped
   ships unverified database code straight to a Vercel deploy. That is what this spec closes.

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-12-1316-security-hardening-and-standard/` — decision 5,
  "Dependabot, not CI: Husky already runs lint/typecheck/unit pre-commit and integration
  pre-push." This spec keeps hooks as the gate rather than adding CI, and makes that gate
  actually hold.
- **Extends:** `agent-os/specs/2026-08-10-1940-daily-use-performance/standards-testing.md` —
  source of the current `development/testing.md`; its Mechanics table and skip-tolerance
  wording need updating to match.

## Decisions

- **Split the Vitest config into two projects, not one config with a global flag.** The unit
  and integration suites have genuinely different isolation requirements; one flag cannot
  express that, which is how the current over-broad setting happened in the first place.
- **`isolate: false` for unit tests only.** Integration keeps full isolation. Verified the test
  set is identical between isolated and non-isolated runs — 3414 tests, same names, diffed by
  `fullName` from JSON reporters, zero additions or removals.
- **Pre-push starts Postgres and fails if it cannot.** Chosen over a hard "fail if unreachable"
  and over adding CI. Keeps commits Docker-independent, keeps the frozen no-CI decision, and
  removes the silent-skip path to origin.
- **Keep the loud skip in `databaseReachable()`.** It still serves a manual `npm test` with
  Docker down. It just can no longer hide behind a push.

## Acceptance criteria

All measured on the same 12-CPU machine as the numbers in **Context**.

- [x] `npm run test:unit` completes in **under 5s** and runs zero database tests —
      **1.84s**, 294 files / 3414 tests, project `unit` only
- [x] `npm test` completes in **under 30s** with all 348 files and 4327 tests passing —
      **14.6s** wall (1.96s unit + 11.55s integration), 348 files / 4327 tests
- [x] `npm run test:unit` and `npm run test:integration` select suites by project name, not by
      filename glob or path substring — `--project unit` / `--project integration`
- [x] Integration tests run 3 consecutive times with no flake or connection-limit error —
      3/3 at 913/913, ~10s each, peak **41 of 100** Postgres connections
- [x] Pre-push starts a stopped Postgres container automatically and completes — from
      `npm run db:down`, the gate returned healthy in **5.8s**, silent
- [x] Pre-push **fails with a readable message** when Docker itself is not running — verified
      with an unreachable `DOCKER_HOST`: Docker's own "check if the daemon is running"
      message, then `postgres failed — full output: docker compose up -d --wait`, exit 1
- [x] A deliberately failed test still produces legible `gate.sh` output under parallelism —
      verified for one unit and one integration failure. Vitest prints its `Failed Tests`
      block and summary last, so `tail -60` captures the assertion, the diff, the source
      frame and the counts regardless of how the ✓ lines interleave. No reporter change needed.
- [x] `agent-os/standards/development/testing.md` matches the new commands and gate behavior —
      plus the same correction in `AGENTS.md`

## Changes from original plan

| #   | Change                                                                                                        | Why                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `isolate` and `maxForks` moved from the project configs onto the `test:unit` / `test:integration` invocations | Tasks 2 and 3 assumed these are project-scoped. In Vitest 3.2.7 they are not: the runner builds **one** Tinypool from the root config (`vitest.config.poolOptions?.forks`), so a project-level value is accepted by the types, silently ignored at runtime, and leaves no warning. Verified twice — a project-level `isolate: false` still cost the full 9.1s, and a project-level `maxForks: 1` still ran 8-way at 471% CPU. The projects still exist and still do the selecting; only the pool settings moved. |
| 2   | `npm test` is now `npm run test:unit && npm run test:integration` rather than one `vitest run`                | Follows from change 1. Since isolation is per-process, one invocation cannot give unit `isolate: false` and integration `isolate: true` — the spec's central decision. Two invocations give each suite exactly the isolation it was specified to have, and are also **faster** than the single-run plan: 14.6s against the ~21.8s a single isolated run measured.                                                                                                                                                |
| 3   | The two-suite rationale is documented in `vitest.config.ts` as a comment on `projects`                        | The trap in change 1 is invisible — no type error, no warning, just a silently slow suite. The next person to "tidy" the pool flags back into the projects would reintroduce it, so the config says why they are not there.                                                                                                                                                                                                                                                                                      |
| 4   | `AGENTS.md` gained a bullet on non-isolated unit tests                                                        | Task 5 asked only whether its skip-warning guidance needed correcting. It did — but the module-level-state constraint is new and agent-facing, and AGENTS.md is what an agent reads before writing a test.                                                                                                                                                                                                                                                                                                       |

---

## Task 1: Save spec documentation

Create `agent-os/specs/2026-08-26-2242-parallel-test-suite/` with `plan.md` (this file,
**Status: active**), `shape.md`, `standards.md`, `references.md`. No visuals.

`standards.md` pins standards commit **`c1a0a5aa0ec857f1fbc7dfbce485e10f69555260`** and
references — never copies — `development/testing.md` (the gate being changed) and
`development/clean-code.md` ("when the model is wrong, change the model" — one global flag
standing in for two different isolation requirements is exactly that).

## Task 2: Split `vitest.config.ts` into unit and integration projects

> **As built:** the projects carry only `name`, `include` and `exclude`. `isolate` and
> `maxForks` are per-process in Vitest 3.2.7 and live on the npm scripts — see change 1.

Replace the global `fileParallelism: false` with `test.projects` (Vitest 3.2.7 supports it).
Keep `environment`, `env` (the `TZ` pin and its comment — that comment is load-bearing, see
`development/dates.md`), and the `@` alias at the root, and pull them into both projects with
`extends: true`.

- **`unit`** — includes `src/**/*.test.ts`, excludes `**/*.integration.test.ts`, `isolate: false`.
- **`integration`** — includes `src/**/*.integration.test.ts`, isolation left at the default.

Both run parallel; drop `fileParallelism: false` entirely.

Watch for: when overriding `exclude`, spread `configDefaults.exclude` from `vitest/config` or
`node_modules` comes back into the glob.

Rewrite the comment to say what is actually true now — files isolate by creating their own
users, so parallel is safe; unit files are hermetic and skip isolation for speed. Do not leave
the old rationale in place.

Then point the scripts at the projects in `package.json`:

- `test:unit` → `vitest run --project unit`
- `test:integration` → `vitest run --project integration`

This also fixes a latent fragility: `test:integration` is currently `vitest run integration.test`,
a path-substring filter that would silently match any future file with that string in its name.

## Task 3: Bound the integration suite's Postgres connections

> **As built:** `--poolOptions.forks.maxForks=8` on the `test:integration` script rather than
> in the project config, for the reason in change 1. Runtime 10.0–11.6s, within the ~12s bar;
> measured connection peak **41 of 100**, down from 51 unbounded.

Each worker imports `@/db`, which builds its own `postgres()` pool at the library default of
`max: 10`. Vitest's default is CPU-count-minus-one forks, so the ceiling scales with the machine
while `max_connections` stays at 100. Measured peak was 51 on 12 CPUs — comfortable here, but it
is headroom that a bigger machine erodes silently, and the failure mode is a confusing
"too many clients already" rather than a test failure.

Set `poolOptions.forks.maxForks` on the **integration project only** to bound it deterministically.
Start at 8 and confirm the runtime does not regress past ~12s; if it does, raise it and note the
measured peak in the spec. Do not add test-awareness to `src/db/index.ts` — that is app code, and
the bound belongs with the runner.

## Task 4: Make `.husky/pre-push` start the database

Before the test gate, bring Postgres up and wait for it:

- `docker compose up -d --wait` — `docker-compose.yml` already defines a `pg_isready` healthcheck
  with a 5s interval and 10 retries, so `--wait` blocks until healthy and exits non-zero on failure.
- Run it through `scripts/gate.sh` like the other steps, so a healthy start stays silent and a
  failure prints the reason.
- If Docker Desktop itself is not running, this fails with Docker's own message. That is the
  intended behavior — it is now a hard stop, not a skip.

Rewrite the hook's comment block. The current one says integration tests "skip loudly rather than
failing" if Postgres is unreachable and calls that tradeoff deliberate. That is no longer the
contract at push time and the stale comment would actively mislead.

Leave `.husky/pre-commit` alone.

## Task 5: Update the testing standard

In `agent-os/standards/development/testing.md`:

- **Mechanics table** — unchanged commands, but note that unit tests are hermetic and run
  non-isolated for speed, so a unit test must not mutate module-level state.
- **Closing paragraph** — currently states a stopped container "never blocks a commit." Keep that
  (still true for commits) but add that it now blocks a _push_, since pre-push starts the container.
- Keep the "green `test:unit` does not mean the database logic passed" warning. Still true, still
  the thing agents get wrong.

Check whether `CLAUDE.md`/`AGENTS.md`'s Tests section needs the same correction — it repeats the
skip-warning guidance.

## Task 6: Verify, freeze, update roadmap

- Run each acceptance criterion above and record measured numbers in the spec.
- **Verify the failure path explicitly**: temporarily break one unit test and one integration test,
  confirm `gate.sh`'s `tail -60` still yields a legible failure now that workers interleave output.
  This is the token-budget check — if parallel output shreds the tail, fix it here (a `dot`
  reporter, or raising the tail) rather than discovering it mid-debug. Revert the breakage.
- Confirm pre-push works from a genuinely stopped container: `npm run db:down`, then push.
- Update `plan.md`/`shape.md` for as-built drift, complete **Changes from original plan**, mark
  **Status: frozen / complete**.
- Roadmap: check `agent-os/product/roadmap.md` for a matching item; likely none — this is
  infrastructure.

---

## Token budget notes

Raised explicitly in the request, so recording what actually bears on it:

- **`scripts/gate.sh` already solves the main cost** — silent on success, failing tail on stderr.
  Nothing here should add a reporter that narrates a green run. The one thing worth verifying is
  that its tail survives parallel interleaving (Task 6).
- **A 2.1s unit gate changes agent behavior for the better.** At 44s there is an incentive to
  reason about whether tests are worth running; at 2s an agent just runs them, which is cheaper
  than the reasoning was.
- **No CI is also a token decision** — no logs to fetch, no run status to poll. Consistent with the
  frozen `2026-08-12-1316` decision.

## Observation, resolved

The unit test count read 3411 in the first two runs of this session and 3414 in every run since,
stable across serial, parallel, and non-isolated modes. The isolate/no-isolate diff proved the test
_sets_ are identical, so this is not a parallelism artifact. This codebase does have date-dependent
tests — `2026-08-20-1115-timed-isometric-exercises` records one whose hard-coded shelf date arrived
and blocked pre-push. Every run during implementation read **3414**, across isolated, non-isolated
and project-split configurations, so nothing here is date-sensitive on 2026-08-27. Not chased
further; the date-dependent-test risk that spec records is unchanged by this work.

---

**Standing rule while this spec is active:** when a material change is made to requirements,
design or scope — including feedback on what was actually built — update the relevant sections
above and append a row to **Changes from original plan**. Skip pure implementation details.
Freeze when verified.
