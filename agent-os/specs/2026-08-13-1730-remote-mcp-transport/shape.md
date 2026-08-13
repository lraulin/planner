# Remote MCP transport — Shaping Notes

**Status: frozen / complete** (2026-08-13)

## Scope

A public Streamable HTTP MCP endpoint at `/api/mcp` so Grok.com (and any other remote MCP
client) can operate Planner with the existing agent tool registry and Bearer key.

### Out of scope

- MCP OAuth / protected-resource metadata
- Per-user API keys
- SSE transport
- Local stdio MCP server
- New agent tools or a contract version bump
- Changing `/api/agent` envelopes or discovery
- In-app chatbot / Bedrock
- Configuring `~/.grok/config.toml` for the Grok TUI

## Decisions

- Thin wrapper over `dispatchAgentTool`. One write path.
- Catalog is core + domain minus HTTP discovery tools and legacy aliases (26 tools). Grok
  loads every `tools/list` entry into context; the HTTP two-step discovery does not work
  there.
- Same Bearer `PLANNER_AGENT_API_KEY` as `/api/agent` and Alfred. No OAuth in this spec.
- Hand-rolled JSON-RPC adapter in `src/lib/agent/mcp.ts`, not `@modelcontextprotocol/sdk`
  or `mcp-handler` (those want sessions or Redis for SSE).
- MCP responses are JSON-RPC, not `{ ok, data }`.
- Hidden registry names are not callable over MCP.

## Context

- **Visuals:** None
- **References:** Frozen agent-tool-contracts and AI-interoperability specs; `tools.ts`,
  `auth.ts`, `/api/agent/[tool]`, `src/proxy.ts`
- **Product alignment:** Roadmap medium-term “MCP + chat clients” — public HTTPS + Bearer
  at minimum. This spec ships that item.

## Standards Applied

- api/agent-auth — same Bearer key, fail closed, do not log Authorization
- api/agent-tools — registry is canonical; transports project it
- api/error-handling — same codes and messages, mapped into MCP `isError`
- development/security — identities stay separate; proxy is not the auth gate
- development/testing — logic in lib with unit tests; route is a thin HTTP boundary
- api/response-format does **not** apply to `/api/mcp` protocol responses
