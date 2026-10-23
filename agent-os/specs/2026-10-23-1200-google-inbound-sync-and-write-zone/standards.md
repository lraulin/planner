# Standards for Google inbound sync for agents, duplicate-safe creates, and the write zone

**Status: active**

Applied as of standards commit `dff043d6`. References, not copies — recover the text with
`git show dff043d6:agent-os/standards/<path>`.

- `agent-os/standards/api/agent-tools.md` — strict output schemas, generated docs.
- `agent-os/standards/development/dates.md` — rule 8: no business rule may depend on the
  server's `TZ` (Vercel is UTC); the write zone comes from `READER_TIME_ZONE`.
- `agent-os/standards/development/security.md` — adopting a mirrored row scopes on `userId`.
- `agent-os/standards/development/testing.md` — pure matcher unit tests; the adopt path gets an
  integration test with a second user.
- `agent-os/standards/development/commits.md` — `Spec:` trailer.

## Deviations

None. (A failed Google pull is reported as `googleSync` status on a successful read, not an
error: the local week is still correct for everything already mirrored.)
