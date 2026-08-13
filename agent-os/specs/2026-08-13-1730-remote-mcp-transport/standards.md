# Standards for Remote MCP transport

Full files stay in `agent-os/standards/`. This spec references them rather than copying
their bodies.

## `api/agent-auth.md`

Bearer `PLANNER_AGENT_API_KEY`, fail closed when unset, timing-safe compare, maps to the
agent user. `/api/mcp` uses `requireAgentApiKey` unchanged.

## `api/agent-tools.md`

One registry, one write path through `src/lib/**`. HTTP discovery, docs, and this MCP
transport are projections. Do not invent a second catalog.

Focused HTTP exposure still applies to `/api/agent`. MCP is the exception that lists
core+domain up front because Grok.com cannot do two-step discovery.

## `api/error-handling.md`

Same codes (`unauthorized`, `validation`, `not_found`, `conflict`, `internal`) and the
same messages. On MCP, tool-level failures become `tools/call` `isError` results so the
model can recover. Auth failure stays HTTP 401 before JSON-RPC.

## `development/security.md`

Proxy cookie-presence is not the gate. `/api/mcp` is allowed through the proxy the same
way `/api/agent` is; the route handler checks the key. Do not log `Authorization`. Agent
identity stays `getAgentUserId()`, not the session or dev-bypass user.

## `development/testing.md`

Pure adapter logic lives in `src/lib/agent/mcp.ts` with `mcp.test.ts`. The route test
covers the HTTP boundary (auth, initialize, list). No new database integration suite —
`dispatchAgentTool` is already proven.

## Not applied

`api/response-format.md` (`{ ok, data }` / `{ ok, error }`) is the `/api/agent/{tool}`
contract. MCP uses JSON-RPC and MCP tool results.
