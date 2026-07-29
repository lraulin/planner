# Agent API authentication

## Mechanism (MVP)

- Environment variable: **`PLANNER_AGENT_API_KEY`** (long random secret).
- Header: **`Authorization: Bearer <key>`**.
- If the env var is **unset or empty**, agent routes fail closed with `internal` (misconfiguration),
  not open access.
- Wrong or missing header → `unauthorized` / HTTP 401.

## Identity

Until Better Auth lands, a successful key maps to **`getCurrentUserId()`** (the seeded dev
user). The key is not multi-tenant; it is a single shared secret for personal agent access.

When real auth lands, keep the same header for machine clients or map the key to a user id
without changing tool contracts.

## Never

- Commit real keys.
- Put the key in client-side browser code or public repo docs as a live value.
- Log the full Authorization header.
