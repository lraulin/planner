# MCP OAuth for Grok connectors

**Status: frozen / complete** (2026-08-27)
Spec folder: `agent-os/specs/2026-08-13-1805-mcp-oauth/`

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-13-1730-remote-mcp-transport/`
- **Supersedes:** `agent-os/specs/2026-08-13-1730-remote-mcp-transport/` — the assumption that Grok.com would accept a static Bearer API key in the custom-connector dialog.

## Context

Grok.com custom connectors do not have an API-key field. After the MCP URL is entered they
show an OAuth app-registration dialog (Client ID, secret, authorize URL, token URL, PKCE).
Our first MCP ship returned `401` with `WWW-Authenticate: Bearer realm="planner"` and no
protected-resource metadata. Grok’s discovery then produced broken placeholders
(`https://./authorize`).

## Decisions

- Planner is its own OAuth 2.1 authorization server (PKCE S256, public clients).
- Publish RFC 9728 PRM and RFC 8414 AS metadata under `/.well-known/*`.
- `WWW-Authenticate` on MCP 401 includes `resource_metadata` and `scope="planner"`.
- Static public client id `planner` so the Grok form can be filled by hand.
- Dynamic client registration and Client ID Metadata Documents so Grok can skip the form on a retry.
- Authorize at `/oauth/authorize` (browser login via existing `/login`, then consent).
- Access tokens are HMAC-signed, audience-bound to `/api/mcp`, issued to the **session user** who approved — not only the agent API-key account.
- The static `PLANNER_AGENT_API_KEY` still works on `/api/mcp` and remains the only auth on `/api/agent`.
- No new database tables. No MCP SDK.

## Acceptance criteria

- [x] Unauthenticated `POST /api/mcp` returns 401 whose `WWW-Authenticate` names the PRM URL.
      Pinned by `src/app/api/mcp/route.test.ts` — "rejects a missing bearer key before JSON-RPC".
- [x] `GET /.well-known/oauth-protected-resource` and `GET /.well-known/oauth-authorization-server` succeed without a session cookie.
      Routes under `src/app/.well-known/`; shapes pinned by `src/lib/oauth/metadata.test.ts`.
- [x] Token endpoint exchanges a PKCE code for an access token that can `initialize` `/api/mcp`.
      `src/app/api/oauth/token/route.test.ts` plus "accepts an OAuth access token issued for this
      MCP resource" in the MCP boundary test.
- [x] Grok form values work: client id `planner`, empty secret, `/oauth/authorize`, `/api/oauth/token`, scope `planner`, PKCE none.
      Confirmed against a real Grok.com connector before freeze.

## Changes from original plan

| #   | Change                                                                              | Why                                                                                                                                                                                                   |
| --- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Acceptance was ticked at freeze (2026-08-27) rather than as each item was verified. | The code shipped in `5712eb0` on 2026-08-13 and the spec was then left open for two weeks. The first three criteria are ticked against named tests; the fourth against a real Grok connector sign-in. |

## Follow-ups (new work — not amendments to this frozen spec)

- `agent-os/product/roadmap.md` still described OAuth as open under the MCP transport entry;
  corrected at this freeze. Per-user keys and mapping a key to a real user beyond
  `PLANNER_AGENT_USER_EMAIL` remain genuinely open.
