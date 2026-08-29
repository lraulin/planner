# Standards for target refill basis

Applied as of standards commit `2920aa766f203439f2136c831f01ccd182c0654d`. References, not
copies — recover the exact text with
`git show 2920aa7:agent-os/standards/<path>` (see `AGENTS.md`).

- `agent-os/standards/development/testing.md` — the arithmetic being changed is pure `src/lib`
  logic, which is exactly where a wrong answer looks plausible; every changed formula gets a test
  named for the claim it defends. `saveEnvelopeTarget` touches the database, so it needs a
  `*.integration.test.ts` with the cross-user read / change / delete triple. No component tests.
- `agent-os/standards/development/dates.md` — `since` is a calendar day, not an instant. It uses
  the `YYYY-MM-DD` date-key encoding and the 0-is-Sunday weekday convention already used by
  `weekdayOfDateKey`; the backfill from `created_at` (a `timestamptz`) must produce a wall-clock
  date key, never a UTC-shifted one. No `Date` loop and no process-local clock in `cadence.ts`.
- `agent-os/standards/database/migrations.md` — the backfill is generated
  (`drizzle-kit generate --custom`), never hand-written without its snapshot; production migrates
  during the build, and Neon needs the same migration a local Docker run gets.
- `agent-os/standards/development/clean-code.md` — "when the model is wrong, change the model".
  The two-workarounds signal (`paidFromActivity` plus the floor rule applied to refills) is what
  justifies moving the basis rather than patching the call site.
- `agent-os/standards/development/commits.md` — the commit body says what the root cause was:
  Activity in the assignment basis.
- `agent-os/standards/components/drawer-pattern.md` — `TargetDrawer` keeps its footer and
  unsaved-changes behaviour; only its computed preview lines change.

## Deviations

None.
