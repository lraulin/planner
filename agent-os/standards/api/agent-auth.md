# Agent API authentication

## Mechanism (MVP)

- Environment variable: **`PLANNER_AGENT_API_KEY`** (long random secret).
- Header: **`Authorization: Bearer <key>`**.
- If the env var is **unset or empty**, agent routes fail closed with `internal` (misconfiguration),
  not open access.
- Wrong or missing header → `unauthorized` / HTTP 401.

## Identity

A successful key maps to the **agent user** via `getAgentUserId()` / `resolveAgentUserId()`
(`src/lib/auth/identity.ts`), whose address comes from **`PLANNER_AGENT_USER_EMAIL`**.

That variable is **required in production** — an unset value throws rather than falling back
to a default account. The old default (`dev@example.com`) was harmless while one account
existed and a silent cross-account write once more than one did. Outside production it falls
back to the dev-bypass user (`AUTH_DEV_USER_EMAIL`, default `test@example.com`), so a local
machine with no agent configuration points at the test account rather than at nothing.

The agent user is **not** the dev-bypass user and **not** a session user, even when the
addresses happen to coincide locally. Session cookies are for humans at `/login`; machine
clients keep Bearer auth.

The key is **not** multi-tenant: one key per deployment, one configured account. Per-user
keys would grow out of `resolveAgentUserId()`.

## Never

- Commit real keys.
- Put the key in client-side browser code or public repo docs as a live value.
- Log the full Authorization header.
