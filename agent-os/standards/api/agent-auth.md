# Agent API authentication

## Mechanism (MVP)

- Environment variable: **`PLANNER_AGENT_API_KEY`** (long random secret).
- Header: **`Authorization: Bearer <key>`**.
- If the env var is **unset or empty**, agent routes fail closed with `internal` (misconfiguration),
  not open access.
- Wrong or missing header → `unauthorized` / HTTP 401.

## Identity

A successful key maps to the **owner user** via `getOwnerUserId()` / `resolveAgentUserId()`
(email from `PLANNER_AGENT_USER_EMAIL` or `AUTH_SEED_EMAIL`, default `dev@example.com`).

The key is **not** multi-tenant and does **not** use a browser session. Session cookies are
for humans at `/login`; machine clients keep Bearer auth.

## Never

- Commit real keys.
- Put the key in client-side browser code or public repo docs as a live value.
- Log the full Authorization header.
