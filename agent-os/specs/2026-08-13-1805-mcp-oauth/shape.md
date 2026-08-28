# MCP OAuth for Grok connectors — Shaping Notes

**Status: frozen / complete** (2026-08-27)

## Scope

Make Grok.com’s custom-connector OAuth dialog work. Planner becomes a small OAuth 2.1
authorization server in front of the existing `/api/mcp` resource.

### Out of scope

- Per-user API keys for `/api/agent`
- A third-party IdP (Auth0, etc.)
- SSE
- Changing the tool catalog

## Decisions

- Grok does not accept a static Bearer key in the connector UI. OAuth is required.
- Discovery failed because `/.well-known/*` was behind the login redirect — that is why
  the form showed `https://./authorize`.
- Consent uses the existing session / `/login`. Tokens bind to that user.
- Static client id `planner` is the fill-in-the-form escape hatch.

## Context

- **Visuals:** Grok “OAuth Credentials Required” dialog (Client ID, secret, authorize,
  token, scopes, PKCE).
- **Product alignment:** Completes the medium-term MCP + chat clients item’s auth half.
