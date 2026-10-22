# Standards for Node-postgres driver

Applied as of standards commit `5f665924`. References, not copies — see AGENTS.md.
`git show 5f665924:agent-os/standards/<path>` recovers what applied.
Pinned at freeze (2026-10-22): `dff043d6`, which includes this spec's own Task 9 edits.

- `agent-os/standards/database/migrations.md` — migrations run through drizzle-kit over
  `DIRECT_DATABASE_URL` during the production build; D7 changes which driver drizzle-kit picks
  and Task 9 updates the Connections section. No migration is written.
- `agent-os/standards/database/read-latency.md` — `npm run perf:routes` is the measurement
  the acceptance criteria use. Its note that every query counts twice is what this spec
  removes, and its "reads go out together" rule gains D5's limit: on the pool, not on a
  transaction. Task 9 updates both.
- `agent-os/standards/development/security.md` — "messages the database wrote are not
  user-facing". D4 replaces the tell that section documents, and Task 9 rewrites it.
- `agent-os/standards/development/testing.md` — the redaction logic stays in `src/lib` with
  unit tests; the driver-facing behaviour gets integration tests against real Postgres; a
  green unit run is not evidence the database tests ran.
- `agent-os/standards/development/clean-code.md` — "one shared implementation per concern" is
  the basis for D5's single helper; "no speculative generality" is why D3 has no wrapper.
- `agent-os/standards/development/dates.md` — no business rule may depend on the server's
  `TZ`; D2's `parseInputDatesAsUTC` keeps a raw `Date` parameter from doing so.
- `agent-os/standards/development/commits.md` — one logical change per commit, each
  implementing commit carries this spec's `Spec:` trailer.

## Deviations

**No new second-user integration test.** `testing.md` requires one for anything touching the
database. This spec adds no query and no mutation; it changes the driver under the existing
ones. The criterion is that the existing cross-user suite passes, unskipped, on the new driver.
The integration tests this spec does add (type pinning, constraint recognition, connection
failure redaction) involve no user-owned rows.
