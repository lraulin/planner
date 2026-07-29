# Email / password authentication — Shaping Notes

**Status: frozen / complete** (2026-07-29)

## Scope

Gate the planner behind real login so personal data (notes, insurance info, etc.) is not
readable by anyone with the public Vercel URL. Email + password via **Better Auth**
(self-run, Drizzle, our migrations). Single owner account for now; multi-user-ready schema
stays as-is.

### Out of scope

- Public signup / invite UI
- OAuth / magic links / passkeys
- Password-reset email (no mail provider)
- Multi-user admin UI
- Neon Auth / Managed Better Auth
- Changing agent tool contracts (identity resolution only)

## Decisions

- **Better Auth self-run** (tech-stack.md) — not Neon Auth
- **Email + password**, not a separate username field
- Default local seed email **`dev@example.com`** (migrates legacy `dev@localhost` in place —
  Better Auth rejects bare `@localhost` emails)
- **No public signup** — seed/env credentials only (`disableSignUp: true`)
- Unauthenticated visitors **redirect to `/login`** for all app pages
- Extend existing `users` table + add session/account/verification; keep existing UUIDs
- Agent API stays **Bearer key**; maps to owner user without a browser session
- `getCurrentUserId()` is the browser session seam only after this work

## Context

- **Visuals:** None
- **References:** `src/lib/auth.ts`, `users` table + all `userId` scoping, agent Bearer auth,
  seed, shell `TabStrip`
- **Product alignment:** Roadmap Phase 2 multi-user accounts & auth; mission multi-user-ready;
  own-your-data (identity in our Postgres)

## Standards Applied

- development/testing — pure logic + DB cross-user; no React component tests
- api/agent-auth — Bearer key; update identity after Better Auth
- api/response-format — agent envelope unchanged
- api/error-handling — agent `unauthorized` 401
