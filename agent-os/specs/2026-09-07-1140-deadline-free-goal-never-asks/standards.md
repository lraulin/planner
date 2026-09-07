# Standards for "A goal with no deadline never asks"

Applied as of standards commit `a1645dc`. References, not copies — see `AGENTS.md`.

- `agent-os/standards/development/testing.md` — the change is two lines of `src/lib/finances/`
  logic and the tests that name what they defend. Nothing touches the database or a mutation's
  `userId` scoping, so no `*.integration.test.ts`. The failing case is written first, and the
  guard suites (`balance` floors, `upTo` piles, `save` + `by`) must pass untouched.
- `agent-os/standards/development/clean-code.md` — the rejected alternative in D2 is the
  standard's own prohibition applied: a peak-contribution accumulator would store a second,
  stickier "done" beside the one the ledger already implies.
- `agent-os/standards/development/commits.md` — one logical change, a body saying what the root
  cause was, and the `Spec:` trailer. Per `/fix-bug`: say what the cause was, not just what
  moved.
