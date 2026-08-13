# MCP OAuth for Grok connectors

**Status: active**
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

- [ ] Unauthenticated `POST /api/mcp` returns 401 whose `WWW-Authenticate` names the PRM URL.
- [ ] `GET /.well-known/oauth-protected-resource` and `GET /.well-known/oauth-authorization-server` succeed without a session cookie.
- [ ] Token endpoint exchanges a PKCE code for an access token that can `initialize` `/api/mcp`.
- [ ] Grok form values work: client id `planner`, empty secret, `/oauth/authorize`, `/api/oauth/token`, scope `planner`, PKCE none.

## Changes from original plan

| #   | Change | Why |
| --- | ------ | --- |
|     |        |     |
