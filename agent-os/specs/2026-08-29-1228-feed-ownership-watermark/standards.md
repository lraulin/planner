# Standards for feed ownership: SimpleFIN owns history, the browser snapshot owns the tail

Applied as of standards commit `2920aa766f203439f2136c831f01ccd182c0654d`. References, not
copies — see AGENTS.md.

- `agent-os/standards/development/clean-code.md` — the watermark is a model correction of the
  kind this standard asks for: two workarounds (a description matcher, then a brand-stem
  matcher) for one missing concept. Also governs where the new logic lives — `src/lib/**`,
  never in a component, with `userId` on every mutation.
- `agent-os/standards/development/testing.md` — the watermark split and the bill-claim rule are
  pure logic and get unit tests; sync retirement and state carry-over touch the database and get
  `*.integration.test.ts` with a second user proving isolation.
- `agent-os/standards/development/dates.md` — the watermark is a calendar day compared against
  calendar days. Posted dates are date-only strings; no `startOfDay`, no instant/day confusion
  at the boundary that decides which feed owns a row.
- `agent-os/standards/components/data-grid.md` — the Source column is a column on the one
  shared DataGrid: sortable, filterable, groupable, reachable by search, with its visibility
  persisted like every other preference.
- `agent-os/standards/development/security.md` — every new mutation (retirement, state
  carry-over) takes `userId` and proves ownership before writing.
- `agent-os/standards/development/commits.md` — one logical change per commit; the message is
  the record, since nothing is reviewed before it lands.

## Deviations

None.
