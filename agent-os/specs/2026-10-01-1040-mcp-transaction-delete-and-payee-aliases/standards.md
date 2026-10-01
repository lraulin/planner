# Standards for delete transactions and edit payee aliases over MCP

**Status: active**

Applied as of standards commit `866bae77`. References, not copies — recover the text with
`git show 866bae77:agent-os/standards/<path>`.

- `agent-os/standards/api/agent-tools.md` — one registry entry per tool, strict schemas,
  effects and retry classification, all-or-nothing batches, foreign ids are `not_found`,
  generated docs.
- `agent-os/standards/api/error-handling.md` — `validation`, `not_found`, `conflict` codes with a
  correction in the message.
- `agent-os/standards/development/security.md` — every query scopes on `userId`; ownership is
  proven before any write.
- `agent-os/standards/development/testing.md` — DB-touching tools get `*.integration.test.ts`
  with a second user who fails at every step.
- `agent-os/standards/development/commits.md` — one logical change per commit, `Spec:` trailer.

## Deviations

None.
