# Remote MCP transport

**Status: frozen / complete** (2026-08-13)
Spec folder: `agent-os/specs/2026-08-13-1730-remote-mcp-transport/`

This is the authoritative as-built record. Further MCP work (OAuth, per-user keys, SSE)
should open a new delta-spec.

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-09-1130-agent-tool-contracts/` — same registry, schemas, dispatch, and write path. This spec adds the MCP transport that spec listed as a follow-up.
- **Extends:** `agent-os/specs/2026-07-29-1500-ai-interoperability/` — Bearer `PLANNER_AGENT_API_KEY` and tool-shaped HTTP remain. MCP is the wrapper that spec left out of scope.

## Context

Grok.com custom connectors need a public MCP URL (Streamable HTTP or SSE). Planner already
had a public, authenticated tool API at `POST /api/agent/{tool}`, which is REST with
`{ ok, data }`. Pasting it into Grok failed discovery.

The roadmap’s medium-term AI item was this: package the same agent tools as a remote MCP
server — a thin wrapper, not a second write path.

After deploy, the grok.com form is:

| Field          | Value                                                             |
| -------------- | ----------------------------------------------------------------- |
| Custom name    | `Planner`                                                         |
| MCP server URL | `https://planner-lee-5344.vercel.app/api/mcp`                     |
| Auth           | Bearer `PLANNER_AGENT_API_KEY` (the same key Alfred already uses) |

## Decisions

- **One write path.** `tools/call` goes through `dispatchAgentTool`.
- **URL.** `POST /api/mcp`. Production: `https://planner-lee-5344.vercel.app/api/mcp`.
- **Transport.** Stateless Streamable HTTP, JSON only. GET returns 405 with `Allow: POST`.
- **No MCP SDK.** Five-method JSON-RPC adapter in `src/lib/agent/mcp.ts`.
- **Catalog.** 26 core+domain tools. Hidden: `list_tools`, `describe_tool`, `health`, and
  every `legacy` alias. Hidden names are not callable over MCP.
- **Auth.** Same `requireAgentApiKey`. Fail closed. 401 +
  `WWW-Authenticate: Bearer realm="planner"`.
- **Proxy.** `/api/mcp` is allowed without a session cookie, like `/api/agent`.
- **Envelopes.** JSON-RPC / MCP results, not `{ ok, data }`. Tool failures are
  `isError: true` with the existing agent message. Auth is HTTP 401 before JSON-RPC.
- **initialize** advertises `serverInfo.name = "planner"` and a short `instructions`
  string so a chat client without `planner-agent` skills still starts at `get_context`.

## Acceptance criteria

- [x] `POST /api/mcp` with a valid Bearer key completes MCP `initialize` and `tools/list`.
- [x] `tools/list` contains the 26 core+domain tools and does **not** contain `list_tools`, `describe_tool`, `health`, `capture`, `list_notes`, or `set_focus_area`.
- [x] `tools/call` for a listed tool runs `dispatchAgentTool` and returns the tool payload as MCP text/JSON content.
- [x] Unknown fields, unknown tools, and domain errors surface as MCP `isError` with the same messages the HTTP API already uses.
- [x] Missing/invalid/unset API key never serves tools (401 or fail-closed `internal`).
- [x] Unauthenticated browser requests to `/api/mcp` are not redirected to `/login`.
- [x] `/api/agent/{tool}` behavior is unchanged.
- [x] README documents the grok.com name, URL, and Bearer key.
- [x] Unit + HTTP-boundary tests cover the adapter and route. `smoke:agent` covers live initialize, list, and one read call.
- [ ] After production deploy, paste `https://planner-lee-5344.vercel.app/api/mcp` into grok.com. Manual; CI cannot click the connector UI. Ship of the URL is this freeze; confirming the Grok form is a follow-up if the first paste fails.

## Changes from original plan

| #   | Change                                                                                 | Why                                                                              |
| --- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 1   | `initialize` includes a short `instructions` string                                    | grok.com will not load `planner-agent` skills; one paragraph orients the catalog |
| 2   | Hidden registry names are rejected on `tools/call`, not only omitted from `tools/list` | Keeps the MCP surface identical to the catalog                                   |

## Code map (as built)

| Concern                      | Location                                              |
| ---------------------------- | ----------------------------------------------------- |
| JSON-RPC adapter and catalog | `src/lib/agent/mcp.ts`                                |
| Adapter unit tests           | `src/lib/agent/mcp.test.ts`                           |
| Streamable HTTP route        | `src/app/api/mcp/route.ts`                            |
| HTTP boundary tests          | `src/app/api/mcp/route.test.ts`                       |
| Cookie-gate exception        | `src/proxy.ts`                                        |
| Live MCP smoke               | `scripts/smoke-agent.mjs`                             |
| Generated contract docs      | `scripts/generate-agent-docs.ts`, `docs/agent-api.md` |

## Verification

- 2089 unit tests passed, including the new adapter and route suites.
- `npm run smoke:agent` passed 8 checks on the running dev server, including MCP
  initialize, a 26-tool list, and `tools/call get_context`.
- `POST /api/mcp` without a key returns 401 JSON; `GET /api/mcp` returns 405. Neither
  redirects to `/login`.
- Lint and typecheck passed via the commit hook.
- grok.com click-through was not available in this session.

## Follow-ups (new work — not amendments to this frozen spec)

- Confirm the grok.com custom connector after production deploy.
- MCP OAuth / protected-resource metadata if Grok’s API-key field is missing or awkward.
- Per-user API keys.
- Optional Grok TUI `~/.grok/config.toml` entry for this coding-agent session.
- SSE transport (needs a session store; not on Hobby without Redis).

## Out of scope (still)

- New agent tools or a contract version bump
- Changing `/api/agent` envelopes or discovery
- In-app chatbot / Bedrock
- Local stdio MCP server
