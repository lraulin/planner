# Standards for Brain plex: gates, curved links, drag to create and connect

Applied as of standards commit `dff043d6`. References, not copies — see AGENTS.md.

- `agent-os/standards/components/navigation.md` — drag is an additional path; Add child/parent/jump keep their command and menu entries.
- `agent-os/standards/components/responsive.md` — mobile list fallback is unchanged; plex is desktop only.
- `agent-os/standards/database/read-latency.md` — gate flags are `EXISTS` columns in the existing one-statement `loadPlex`, not extra queries.
- `agent-os/standards/development/testing.md` — pure geometry/drag logic in `src/lib/brain/` with tests; gate flags get an integration test including a second user; no component tests.
- `agent-os/standards/development/clean-code.md` — siblings change shape (`viaParentId`) rather than being re-derived in the component.

## Deviations

None.
