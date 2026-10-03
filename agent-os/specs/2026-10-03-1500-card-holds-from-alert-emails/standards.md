# Standards for Card holds from alert emails

Applied as of standards commit `a3e36717`. References, not copies — see AGENTS.md.

- `agent-os/standards/development/testing.md` — the alert write touches the database, so it gets
  an integration test with a second user failing to read, change and delete.
- `agent-os/standards/development/clean-code.md` — the parser is pure logic in `src/lib/**`.
- `agent-os/standards/development/commits.md` — one logical change per commit, body records why.

## Deviations

None.
