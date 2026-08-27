# References for Pull-request CI

## Governing specs

### `agent-os/specs/2026-08-12-1316-security-hardening-and-standard/`

- **Relationship:** Supersedes — decision 5, "Dependabot, not CI", and only its "not CI" half.
- **Relevant decision:** "Husky already runs lint/typecheck/unit pre-commit and integration
  pre-push. The gap is dependency drift, which Dependabot closes directly." Dependabot did close
  the drift gap and its config is unchanged by this spec. What the decision did not anticipate is
  that Dependabot closes drift by opening _branches_, and a branch that never touches Lee's
  machine never fires a hook. The Husky premise is true for Lee's commits and false for
  Dependabot's.

### `agent-os/specs/2026-08-26-2242-parallel-test-suite/`

- **Relationship:** Extends.
- **Relevant decisions:** Hooks are the gate for pushes, and the push-time database gate must be
  real — `.husky/pre-push` starts Postgres itself so integration tests cannot skip on the way to
  origin. Both carry forward unchanged. That spec put "Adding CI" out of scope, to "revisit only
  if the hooks stop being sufficient"; this is the revisit, on a trigger it did not name. Its
  reasoning for rejecting CI ("async, reports after the Vercel deploy has already started") is
  specifically about `push` CI and is the reason this spec is `pull_request`-only.
- **Also load-bearing here:** the note in `vitest.config.ts` that isolation and worker count are
  per-process, not per-project, which is why `npm test` chains two scripts. CI must call
  `npm test`, not a single vitest invocation.

### `agent-os/specs/2026-08-13-0940-custom-view-working-set/`

- **Relationship:** Neither — cited only to explain why PR #6 is abandoned rather than merged.
- **Relevant fact:** frozen 2026-08-25 with the built-in/user view split intact, eleven days
  after PR #6 was opened to remove it.

## Similar implementations

### `.husky/pre-push`

- **Location:** `.husky/pre-push`, `scripts/gate.sh`
- **Relevance:** The closest thing to what CI does — the same command sequence, against a
  Postgres the hook starts itself. Its header comment is the best statement of why an
  integration gate has to be unskippable to be a gate at all.
- **Key patterns:** start the database, then fail hard if it is not answering; do not assume it.
  What not to borrow: `gate.sh`'s silence (see `standards.md` deviations).

### `scripts/migrate-on-deploy.mjs`

- **Location:** `scripts/migrate-on-deploy.mjs`
- **Relevance:** How migrations are applied outside a developer machine, and the source of the
  fact that previews share the single Neon database — which is why preview deploys are a weaker
  argument for a branch workflow than they appear.

### `src/lib/testing/database.ts`

- **Location:** `src/lib/testing/database.ts`
- **Relevance:** The file Task 3 changes. `databaseReachable()` and `warnDatabaseSkipped()`
  already carry the reasoning for why an unreachable database skips rather than fails; the CI
  case is a third context that comment does not yet cover.
