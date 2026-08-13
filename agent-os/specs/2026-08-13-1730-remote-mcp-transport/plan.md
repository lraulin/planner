# Remote MCP transport

**Status: active**
Spec folder: `agent-os/specs/2026-08-13-1730-remote-mcp-transport/`

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-09-1130-agent-tool-contracts/` — same registry, schemas, dispatch, and write path. This spec only adds the MCP transport that spec listed as a follow-up.
- **Extends:** `agent-os/specs/2026-07-29-1500-ai-interoperability/` — Bearer `PLANNER_AGENT_API_KEY` and tool-shaped HTTP remain. MCP is the wrapper that spec left out of scope.

## Context

Grok.com custom connectors (`grok.com/connectors` → New Connector → Custom) need a public **MCP** URL (Streamable HTTP or SSE). Planner already has a public, authenticated tool API at `POST /api/agent/{tool}`, but that is REST with `{ ok, data }`. Pasting it into Grok fails discovery.

The roadmap’s medium-term AI item is exactly this: package the same agent tools as a remote MCP server — a thin wrapper, not a second write path — so Grok web (and any other MCP client) can operate the planner.

Success looks like: after deploy, the connector form is

| Field          | Value                                                             |
| -------------- | ----------------------------------------------------------------- |
| Custom name    | `Planner`                                                         |
| MCP server URL | `https://planner-lee-5344.vercel.app/api/mcp`                     |
| Auth           | Bearer `PLANNER_AGENT_API_KEY` (the same key Alfred already uses) |

## Decisions

- **One write path.** `tools/call` goes through `dispatchAgentTool`. No new mutations, no new SQL, no parallel catalog.
- **URL.** `POST /api/mcp`. Production: `https://planner-lee-5344.vercel.app/api/mcp`.
- **Transport.** Stateless **Streamable HTTP**, JSON request/response only. No SSE (Vercel Hobby has no Redis; Grok supports Streamable HTTP; Cloudflare tunnels also require it). GET returns 405 with `Allow: POST`.
- **No MCP SDK / `mcp-handler`.** Hand-roll initialize / tools/list / tools/call / ping / `notifications/initialized` in `src/lib/agent/mcp.ts`. The official transports want sessions; the Vercel adapter wants Redis for SSE. This is a five-method JSON-RPC adapter over an existing registry.
- **Catalog.** `tools/list` exposes every tool with `exposure` `core` or `domain`, except HTTP-only discovery (`list_tools`, `describe_tool`, `health`) and every `legacy` alias. Expected set is **26 tools** (8 remaining core + 18 remaining domain). Grok injects the whole list; two-step HTTP discovery does not work there.
- **Auth.** Same `requireAgentApiKey` / `PLANNER_AGENT_API_KEY` / `getAgentUserId()`. Fail closed if the env var is missing. 401 + `WWW-Authenticate: Bearer realm="planner"` so Grok’s connector knows this is an API-key server. Do not log `Authorization`.
- **Proxy.** Treat `/api/mcp` like `/api/agent`: allowed without a session cookie; the route handler is the gate.
- **Envelopes.** MCP uses JSON-RPC / MCP result shapes, **not** `{ ok, data }`. `api/response-format` stays the HTTP agent contract. Tool failures (`validation`, `not_found`, …) become `tools/call` results with `isError: true` and the existing agent message so the model can recover. Protocol failures (parse, unknown method) are JSON-RPC errors. Auth failure is HTTP 401 _before_ JSON-RPC.
- **Tool descriptions.** Compose `summary`, `useWhen`, `avoidWhen`, and effects (kind / destructive / retry / confirmation). Input JSON Schema from existing `agentJsonSchema(..., true)`.
- **Hidden tools are not callable over MCP** even though HTTP still serves them. The MCP catalog is the MCP surface.
- **No OAuth, no per-user keys, no stdio server, no new tools.** Those stay follow-ups.
- **No Grok TUI config in this spec.** grok.com is the acceptance target. This coding-agent session can keep using the repo + `/api/agent`.

## Acceptance criteria

- [ ] `POST /api/mcp` with a valid Bearer key completes MCP `initialize` and `tools/list`.
- [ ] `tools/list` contains the 26 core+domain tools and does **not** contain `list_tools`, `describe_tool`, `health`, `capture`, `list_notes`, or `set_focus_area`.
- [ ] `tools/call` for a listed tool runs `dispatchAgentTool` and returns the tool payload as MCP text/JSON content.
- [ ] Unknown fields, unknown tools, and domain errors surface as MCP `isError` with the same messages the HTTP API already uses.
- [ ] Missing/invalid/unset API key never serves tools (401 or fail-closed `internal`).
- [ ] Unauthenticated browser requests to `/api/mcp` are not redirected to `/login`.
- [ ] `/api/agent/{tool}` behavior is unchanged.
- [ ] README documents the grok.com name, URL, and Bearer key.
- [ ] Unit + HTTP-boundary tests cover the adapter and route. `smoke:agent` covers live initialize, list, and one read call. No new database suite (dispatch is already integration-tested).
- [ ] After production deploy, `https://planner-lee-5344.vercel.app/api/mcp` is what you paste into grok.com. (The click-through on grok.com is a manual check; CI cannot do it.)

## Changes from original plan

Material refinements during implementation (requirements, design, scope). Omit pure
code polish.

| #   | Change                      | Why |
| --- | --------------------------- | --- |
|     | _(filled during implement)_ |     |

## Task 1: Save spec documentation

Create this folder with plan, shape, standards, and references. **Status: active**.

## Task 2: MCP adapter in `src/lib/agent`

Add `src/lib/agent/mcp.ts` (and `mcp.test.ts`):

- Project `TOOL_REGISTRY` → MCP tools with the catalog rule above.
- Handle JSON-RPC methods: `initialize`, `notifications/initialized`, `ping`, `tools/list`, `tools/call`.
- `tools/call` → `dispatchAgentTool`. Map `AgentError` to MCP `isError` content; do not wrap in `{ ok, data }`.
- Protocol version: accept `2025-03-26` and `2024-11-05`; advertise Streamable HTTP / tools capability; `serverInfo.name = "planner"`.
- Stateless: ignore session IDs. Single-message POST first; if a batch array arrives, handle each item.
- Keep `lib` free of `app` imports.

## Task 3: `/api/mcp` route and proxy exception

- `src/app/api/mcp/route.ts`: `requireAgentApiKey` then adapter. Thin, like `/api/agent/[tool]`.
- 401 + `WWW-Authenticate: Bearer realm="planner"`.
- GET → 405, `Allow: POST`.
- `src/proxy.ts`: allow `/api/mcp` without a session cookie (same comment/block as `/api/agent`).

## Task 4: Tests and smoke

- `mcp.test.ts`: catalog filter, initialize, call dispatch, unknown method, validation `isError`, unknown tool.
- `src/app/api/mcp/route.test.ts`: no key / bad key / missing env / successful initialize / list count.
- Extend `scripts/smoke-agent.mjs` with MCP initialize, `tools/list` membership, and `get_context`.
- Do **not** add a new `*.integration.test.ts` unless dispatch behavior changes (it should not).

## Task 5: Docs

- README **Agent API** section: MCP URL, grok.com steps (name `Planner`, URL, Bearer key), pointer that this is the same registry as `/api/agent`.
- `scripts/generate-agent-docs.ts`: one generated paragraph so `docs/agent-api.md` names `/api/mcp` without becoming a second catalog.
- `.env.example` already has the key; only touch it if a comment about MCP would help.

## Task 6: Verify, freeze spec, update roadmap

- Confirm acceptance criteria.
- Update plan/shape for any material as-built drift; complete **Changes from original plan**.
- Mark files **Status: frozen / complete** (date); list follow-ups as new work.
- Update `agent-os/product/roadmap.md` AI section: this medium-term item is done.

While this spec is **active**, when we make a material change to requirements, design,
or scope (including from feedback on what was implemented), update the relevant sections
and append to **Changes from original plan**. Skip pure implementation details. Freeze
when verified.
