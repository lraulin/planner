# References for Remote MCP transport

## Governing specs

### `agent-os/specs/2026-08-09-1130-agent-tool-contracts/`

- **Relationship:** Extends. MCP transport was a named follow-up / out of scope.
- **Relevant decisions:** Canonical Zod registry, strict schemas, `dispatchAgentTool`,
  focused HTTP discovery, one write path, no second catalog.

### `agent-os/specs/2026-07-29-1500-ai-interoperability/`

- **Relationship:** Extends. Original HTTP agent API; MCP was listed as a follow-up.
- **Relevant decisions:** `POST /api/agent/{tool}`, Bearer `PLANNER_AGENT_API_KEY`,
  `{ ok, data }` envelope (HTTP only).

## Similar implementations

### Agent HTTP boundary

- **Location:** `src/app/api/agent/[tool]/route.ts`, `route.test.ts`
- **Relevance:** Auth + dispatch pattern the MCP route must stay as thin as.
- **Key patterns:** `requireAgentApiKey` then `dispatchAgentTool`; fail closed; no
  domain logic in the route.

### Agent registry

- **Location:** `src/lib/agent/tools.ts`, `auth.ts`, `errors.ts`
- **Relevance:** Catalog, JSON Schema, identity, error codes the MCP adapter projects.
- **Key patterns:** `TOOL_REGISTRY`, `agentJsonSchema`, `exposure`, `toAgentError`.

### Cookie-gate exceptions

- **Location:** `src/proxy.ts`
- **Relevance:** `/api/agent` is already allowed without a session. `/api/mcp` must join
  that list or Grok’s servers get redirected to `/login`.

## External

- [xAI Connectors — custom MCP](https://docs.x.ai/grok/connectors) — name + public URL +
  API key or OAuth; server-to-server; no localhost.
- [xAI Remote MCP tools](https://docs.x.ai/developers/tools/remote-mcp) — Streamable HTTP
  or SSE only.
- [MCP specification](https://modelcontextprotocol.io) — initialize, tools/list,
  tools/call, JSON-RPC.
