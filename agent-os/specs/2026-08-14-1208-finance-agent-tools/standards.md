# Standards for Finance agent tools

**Status: frozen / complete** (2026-08-14)

Full files stay in `agent-os/standards/`. This spec references them rather
than copying their bodies.

## `api/agent-tools.md`

One registry, one write path through `src/lib/**`. HTTP discovery, generated
docs, and MCP are projections. Descriptions are selection instructions.
Focused exposure: these six tools are `domain`, not core. Compact aggregates
except for the paginated search escape hatch. Reject unknown fields.

## `api/response-format.md`

`/api/agent/{tool}` keeps `{ ok, data }` / `{ ok, error }`. Tool output
schemas describe the value under `data`. MCP stays JSON-RPC.

## `api/error-handling.md`

Same codes (`unauthorized`, `validation`, `not_found`, `conflict`,
`internal`). Validation names the field. A second user reading the first
user's finances gets empty results (list/aggregate tools have no foreign id
to 404 on); a missing account id in search simply matches nothing.

## `development/clean-code.md`

The Insights composition leaves the component. `analyzeInsights` and
`searchTransactions` live in `src/lib/finances/`. Tool handlers call queries
and those two modules; they do not contain SQL.

## `development/testing.md`

Pure modules get adjacent unit tests. Tool handlers that touch the database
get `financeTools.integration.test.ts` with a second-user case on every
tool. No React component tests.

## `development/security.md`

Every query takes `userId` and scopes by it. Agent identity stays
`getAgentUserId()`. Do not log `Authorization`. Foreign rows are never
exposed.
