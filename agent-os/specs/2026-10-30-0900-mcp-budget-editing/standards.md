# Standards for MCP budget editing

**Status: in review** (2026-10-30)

Full files stay in `agent-os/standards/`.

## `api/agent-tools.md`

One registry; every write through `src/lib/**`. Descriptions are selection instructions.
Compact rows, paging, strict inputs. Effects: reads `read`; creates, assign and move
`write` (a retry would apply twice); renames, hide, recategorize and split `safeWrite`.

## `api/error-handling.md`

Expected refusals are `validation`, `not_found` or `conflict` with a message the agent can
act on; only real faults are `internal`.

## `api/response-format.md`

`{ ok, data }` / `{ ok, error }`; output schemas describe `data`.

## `development/testing.md`

Logic in `src/lib` with a test beside it; database work in `*.integration.test.ts` with a
second-user isolation check; no `vi.mock`, no Drizzle mocking.

## `development/dates.md`

Months are `YYYY-MM` in, `YYYY-MM` out; the current month comes from the server's
America/New_York today.

## `development/commits.md`

Imperative subject under 72 characters; the body says why.
