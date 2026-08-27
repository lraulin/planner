# Parallelize the test suite and make the integration gate unskippable — Shaping Notes

**Status: active**

## Scope

Two changes that arrived from the same investigation:

1. **Make the suite fast.** Scope Vitest's parallelism and isolation settings to the suites
   that actually need them, instead of one global flag applied to everything.
2. **Make the integration gate real.** Pre-push starts Postgres itself, so database tests can
   no longer be skipped on the way to origin.

### Out of scope

- **Adding CI.** Deliberate, and consistent with the frozen decision 5 in
  `2026-08-12-1316-security-hardening-and-standard` ("Dependabot, not CI"). Revisit only if the
  hooks stop being sufficient.
- **Changing `.husky/pre-commit`.** It already runs lint, typecheck and unit tests only, which
  is the split that was being asked for. It gets faster for free and needs no edit.
- **Removing the loud skip in `databaseReachable()`.** Still correct for a manual `npm test`
  with Docker down. Only its ability to hide behind a push is being removed.
- **Rewriting any test.** Nothing here changes what is asserted.

## Decisions

- **Two Vitest projects, not one global flag.** The unit and integration suites have genuinely
  different isolation requirements. A single `fileParallelism: false` cannot express that, which
  is precisely how it came to be applied to 294 files that never needed it.
- **`isolate: false` for unit tests only.** Bought the largest single win (9.1s → 2.1s). The
  cost is that unit files sharing a worker share module-level state; accepted because the
  testing standard already puts pure logic in `src/lib/**`, and because a leak surfaces as a
  deterministic failure rather than silent wrongness.
- **Pre-push runs `docker compose up -d --wait`.** Chosen over a bare "fail if unreachable"
  (more annoying, no more safety) and over CI (async, reports after the Vercel deploy has
  already started, and contradicts a frozen decision).
- **Bound `maxForks` on the integration project.** Insurance, not speculation: the connection
  ceiling scales with CPU count while `max_connections` does not.

## Context

- **Visuals:** None.
- **Measurements:** taken on a 12-CPU machine with the container healthy. Unit 43.9s → 9.1s
  (parallel) → 2.1s (parallel, non-isolated). Integration 48.0s → 10.4s. Full `npm test`
  96.1s → 21.8s. Only 1.56s of the original unit run was test execution; the rest was
  serialized per-file transform and collect.
- **Safety evidence:** 4 consecutive parallel integration runs passed 913/913 with no flake,
  peaking at 51 of 100 Postgres connections. The isolated and non-isolated unit runs were
  diffed by test `fullName` via the JSON reporter: 3414 tests each, zero additions or removals.
- **References:** see `references.md`.
- **Product alignment:** N/A — infrastructure. No roadmap item expected.

## Standards Applied

See `standards.md`. In short: `development/testing.md` because this changes the gate it
describes, and `development/clean-code.md` because "when the model is wrong, change the model"
is the reason for splitting the config rather than patching around the flag.
