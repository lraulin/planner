# Standards for Finance pages read what they use, not the ledger

Applied as of standards commit `5f665924`. References, not copies — see AGENTS.md.
`git show 5f665924:agent-os/standards/<path>` recovers what applied.

- `agent-os/standards/database/read-latency.md` — every new read joins its page's existing
  `Promise.all`; the Register's count and distinct years fold into one query so the wave
  stays at about ten (D9); `npm run perf:routes -- finances` is an acceptance criterion.
  `oncePerRequest` only where two loaders on one page start from the same read.
- `agent-os/standards/development/testing.md` — each narrow read gets an integration test
  comparing it with the derivation from the full read, and a second user who gets nothing
  (D13). `registerDateBound` is pure logic in `src/lib` with a unit test beside it. No
  component tests for the drawer or the column menu.
- `agent-os/standards/development/clean-code.md` — one definition of row scope
  (`countedRows`), one of split-child totals (D6), one of assignability
  (`categoryAssignableIds`, D9). "When the model is wrong, change the model" is why
  `loadDashboard` is retired rather than trimmed, and why the cached ledger was rejected.
- `agent-os/standards/development/security.md` — every new read and action takes `userId`
  and scopes on it, on both sides of each join.
- `agent-os/standards/development/dates.md` — D7: the day a page calls "today" must not
  depend on the server process's zone.
- `agent-os/standards/components/data-grid.md` — the Register stays on the shared grid;
  D10 changes when its distinct values arrive, not what they are. Read before Task 9.
- `agent-os/standards/api/agent-tools.md` — the five tools that called `loadDashboard` keep
  their inputs and outputs; only the reads beneath them change (D2).
- `agent-os/standards/development/commits.md` — one logical change per commit, each carrying
  `Spec: agent-os/specs/2026-10-13-1147-finance-narrow-ledger-reads`, with the before/after
  byte size and sha256 of the dump in the body.

## Deviations

None.
