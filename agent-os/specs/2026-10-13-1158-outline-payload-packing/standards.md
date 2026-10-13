# Standards for Outline Payload Packing

Applied as of standards commit `5f665924`. References, not copies — see AGENTS.md.
`git show 5f665924:agent-os/standards/<path>` recovers exactly what applied.

- `agent-os/standards/components/data-grid.md` — rows stay in memory and the node grids stay
  non-virtualized; client sort, filter, group and drag depend on that. Filter and search
  reach hidden columns, which is why tree pages are not trimmed to visible columns.
- `agent-os/standards/components/drawer-pattern.md` — the drawer keeps fetching its own
  record on open; this spec leans on that rather than changing it.
- `agent-os/standards/database/read-latency.md` — a page costs round trips, not columns.
  Slices are cut from the one `loadOutline` read; no query is added.
- `agent-os/standards/development/testing.md` — the codec is pure logic in `src/lib` with a
  test beside it that fails on a plausible mistake (a lossy round trip, a regression to
  keyed rows). No component tests. No database code changes, so no new integration test.
- `agent-os/standards/development/clean-code.md` — codec in `lib`, hook in `components`,
  packing in `app`. "When the model is wrong, change the model" is why the transport is
  replaced rather than trimmed around.
- `agent-os/standards/development/dates.md` — calendar-day `Date`s must cross unchanged; the
  codec does not re-encode them.
- `agent-os/standards/development/security.md` — slices filter an already user-scoped read,
  so nothing new crosses users.

## Deviations

None.

## Standards this spec will change

Task 7 adds a rule to `components/data-grid.md`: row sets cross to the browser packed, and a
page that uses the outline as supporting data sends a slice of it.
