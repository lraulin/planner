# Standards for Source currency

Applied as of standards commit `91999a0ab88e`. References, not copies — see AGENTS.md.
`git show 91999a0ab88e:agent-os/standards/<path>` recovers exactly what applied here.

- `agent-os/standards/development/clean-code.md` — this delta is a **model correction**
  under "When the model is wrong, change the model": two workarounds
  (`provisionalBalanceAsOf`, `BROWSER_PENDING_AUTHORITY_MS`) stand in for one missing
  concept. Also governs where the comparison lives — a pure module in `src/lib`, with the
  three writers staying thin.
- `agent-os/standards/development/dates.md` — the load-bearing one. The rule compares
  instants against calendar days; the standard's instant/calendar-day split, `toDateKey`,
  and the ban on `startOfDay` over calendar fields decide how.
- `agent-os/standards/development/testing.md` — the pure rule gets a test beside it; every
  path that touches the database gets a `*.integration.test.ts` that is not done until a
  second user has failed to read, change, and delete the first user's rows.
- `agent-os/standards/database/migrations.md` — `finance_account_source_state` and the
  dropped columns need a generated migration with its snapshot, never a hand-written one.
- `agent-os/standards/development/security.md` — every mutation takes `userId` first and
  scopes by it; the new table is user-owned and is read the same way.
- `agent-os/standards/development/commits.md` — a schema change, a new rule, three moved
  writers and two deletions are not one commit.

## Deviations

**One, in `dates.md` terms.** The freshness comparison sometimes puts an instant and a
calendar day on the same axis, which the standard's two-kinds table otherwise forbids. It is
unavoidable: SimpleFIN and a browser capture report instants, a downloaded file reports only
days, and they have to be ranked against each other.

The deviation is bounded rather than open: the instant is reduced with `toDateKey` — the
same reduction `import.ts:223` already performs — and **the comparison is strictly-newer, so
a tie keeps the incumbent**. No local end-of-day is invented, nothing is converted the other
way, and a same-day skew can only ever fail to promote a source, never regress one.
