# Standards for One history source per account

Applied as of standards commit `30a9c769`. References, not copies — see AGENTS.md.

- `agent-os/standards/development/clean-code.md` — "When the model is wrong, change the model":
  the implicit "has a SimpleFIN link" test and the headline cache on the link are the two
  workarounds for the missing per-account history source (D1, D2).
- `agent-os/standards/database/migrations.md` — new columns, the headline move with backfill, and
  the coverage table.
- `agent-os/standards/development/security.md` — every new query and mutation takes `userId` and
  scopes by it (history source, coverage, cutover).
- `agent-os/standards/development/testing.md` — pure planning in `src/lib/**` with unit tests;
  `*.integration.test.ts` with the second-user check for every new write.
- `agent-os/standards/development/dates.md` and `agent-os/standards/product/date-model.md` —
  `transaction_date` (purchase) vs `posted_date`, coverage ranges, and `history_source_since` are
  calendar days, never instants.
- `agent-os/standards/development/commits.md` — one logical change per commit; the body records
  what each task superseded.

## Deviations

None.
