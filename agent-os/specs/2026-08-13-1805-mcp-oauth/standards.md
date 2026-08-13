# Standards for MCP OAuth

References, not copies:

- `agent-os/standards/api/agent-auth.md` — static Bearer key remains for `/api/agent` and as a second MCP credential.
- `agent-os/standards/development/security.md` — proxy is not the auth gate; well-known and token routes are public, authorize uses a real session.
- `agent-os/standards/development/testing.md` — OAuth logic in `src/lib/oauth` with unit tests; routes stay thin.
