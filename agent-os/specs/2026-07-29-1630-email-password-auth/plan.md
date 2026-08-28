# Email / password authentication (Better Auth)

**Status: frozen / complete** (2026-07-29)  
Spec folder (Task 1): `agent-os/specs/2026-07-29-1630-email-password-auth/`

## Context

Lee is ready to put real personal data in the planner. The deployed app at
`planner-sable-three.vercel.app` currently has **no authentication**:
`getCurrentUserId()` always resolves the seeded `dev@localhost` user, so anyone with the
URL can read and edit everything. README already flags this as unsafe for real data.

Product docs already decided the approach:

- **Mission:** multi-user-ready design from day one; personal use first.
- **Tech stack:** Better Auth **self-run** with the Drizzle adapter — tables in **our**
  schema and migrations (Neon Auth declined: vendor-owned `neon_auth` schema).
- **Roadmap Phase 2:** “Multi-user accounts & sync” — this slice lands the auth gate and
  session-backed identity; cross-device sync is already implied by the web app + Neon.

This feature is the **minimum viable lock**: email + password login, no public signup,
redirect unauthenticated visitors to login. Multi-user _capability_ stays (schema already
scopes every row by `user_id`); only one account is provisioned for now (Lee), via seed /
env credentials. Wife / second user later is seed-or-script, not open registration.

**Related frozen specs:** AI interoperability (`2026-07-29-1500-…`) left “map API key →
real user after Better Auth” as follow-up — this plan closes that in a minimal way
(Bearer key still maps to the owner user via the same identity seam).

## Decisions

| Topic                          | Decision                                                                                                                                                                                                                                               |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Library                        | **Better Auth**, self-run, Drizzle adapter, our migrations                                                                                                                                                                                             |
| Credentials                    | **Email + password** (Better Auth emailAndPassword). “Username and password” in the request means credential login, not a separate username field                                                                                                      |
| Signup                         | **Disabled** in the app. Account created/updated by **seed/env** only                                                                                                                                                                                  |
| Bootstrap                      | Env vars for seed email/password (with safe local defaults for dev); upsert user + credential account without wiping outline data                                                                                                                      |
| Unauthenticated UX             | **Redirect everything** to `/login` except auth endpoints and static assets                                                                                                                                                                            |
| Identity seam                  | `getCurrentUserId()` becomes **session lookup**; throw/redirect when no session                                                                                                                                                                        |
| Agent API                      | Keep **Bearer `PLANNER_AGENT_API_KEY`**. After key check, resolve the **owner user** (same seeded personal account), not a browser session — machine clients have no cookies                                                                           |
| Schema strategy                | **Extend** existing `users` table for Better Auth fields; add `session` / `account` / `verification` (or Better Auth’s configured names) with FKs to `users.id` (uuid). Do **not** introduce a second identity table that app data would have to re-FK |
| Social / magic link / passkeys | Out of scope                                                                                                                                                                                                                                           |
| Password reset email           | Out of scope for MVP unless Better Auth local flow is free (no email provider). Prefer change-via-seed for now                                                                                                                                         |
| Multi-user UI                  | Out of scope — no invite UI, no user admin                                                                                                                                                                                                             |
| Vercel Protection              | Not used; app-level auth is the fix                                                                                                                                                                                                                    |

### Out of scope

- Public registration / invite links
- OAuth (Google, etc.) — revisit with Google Calendar
- Role/permissions beyond “logged-in owner of own rows”
- Neon Auth / Managed Better Auth
- Marketing landing page (everything gated)
- Changing agent tool contracts (only identity resolution behind the key)

## Acceptance criteria

- [x] Unauthenticated browser request to any app page (e.g. `/outline`, `/notes`) redirects to `/login`
- [x] Unauthenticated server actions / data paths cannot return another user’s (or the owner’s) data — session required
- [x] Correct email/password signs in; session persists across refresh
- [x] Wrong password does not sign in; no stack traces or secret leakage
- [x] Logout clears session; subsequent visits require login again
- [x] Sign-up is not available in the UI and is disabled in Better Auth config
- [x] Seed (or documented script) can create/update the owner credentials from env without deleting existing planner data
- [x] Production env docs: `BETTER_AUTH_SECRET`, app URL, seed credentials, existing DB vars
- [x] Agent `POST /api/agent/*` still works with Bearer key (maps to owner user); wrong/missing key still 401
- [x] Integration tests still enforce cross-user isolation; auth pure helpers tested if non-trivial
- [x] README public-no-auth warning removed/replaced; roadmap Phase 2 auth item updated on freeze
- [x] Spec frozen when verified

## Changes from original plan

Material refinements during implementation (requirements, design, scope). Omit pure code polish.

| #   | Change                                                                | Why                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Default seed email `dev@example.com` (migrate from `dev@localhost`)   | Better Auth's zod email validator rejects `@localhost`; keep same `users.id` via seed rename                                                                                                                                                                                                                                                                                                                                                                                                  |
| 2   | Hand-written `0007_better_auth` migration (custom)                    | drizzle-kit generate needed TTY for column-conflict prompts in this environment                                                                                                                                                                                                                                                                                                                                                                                                               |
| 3   | `accounts` carries Better Auth's `issuer`, and provisioning writes it | Better Auth 1.7 keys an account by (`issuer`, `accountId`) and matches credential sign-in on `issuer = 'local:credential'`. We own this table, so a column they add is a column we must add: without it every password login answered "Invalid email or password". Sign-in is now exercised end to end (`signin.integration.test.ts`) and the four Better Auth tables are checked against their model (`schema.test.ts`), because asserting on the stored hash cannot see this class of break |

---

## Task 1: Save Spec Documentation

Create `agent-os/specs/2026-07-29-1630-email-password-auth/` with:

- **plan.md** — This full plan (**Status: active**), including empty **Changes from original plan**
- **shape.md** — Shaping notes (scope, decisions, context)
- **standards.md** — Full text of applicable standards
- **references.md** — Seams and related code studied
- **visuals/** — Empty or omit (none provided)

While this spec is **active**, on any material change to requirements, design, or scope
(including feedback on what was implemented), update the relevant sections and append to
**Changes from original plan**. Skip pure implementation details. Freeze when verified.

## Task 2: Add Better Auth and core server config

- Depend on `better-auth` (and any required peer used by the Drizzle adapter docs for the
  current version).
- Create `src/lib/auth/server.ts` (or equivalent) exporting the Better Auth instance:
  - Drizzle adapter bound to our `db` + schema tables
  - `emailAndPassword: { enabled: true, disableSignUp: true }` (or equivalent “no signup”)
  - `secret` / `baseURL` from env (`BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` or app URL)
  - Prefer **uuid** user ids to match existing `users.id` and FKs
- Keep a thin public re-export story so `getCurrentUserId` stays the app’s identity seam
  (callers in `src/app/**/actions.ts` should not import Better Auth directly if avoidable).

## Task 3: Schema + migration for Better Auth tables

- Extend `users` only as needed for Better Auth (e.g. `emailVerified`, `image` if required).
- Add tables for **session**, **account** (password credential lives here in Better Auth),
  **verification** per Better Auth + Drizzle adapter requirements.
- Generate migration (`0007_…` after notes); ensure production migrate-on-deploy path still
  works (`VERCEL_ENV=production` + `DIRECT_DATABASE_URL`).
- **Data safety:** existing Neon rows for `dev@localhost` (or whatever email becomes the
  owner) must keep the same `users.id` so outline/notes/schedule FKs remain valid. Prefer
  _add columns / new tables_ over recreating `users`.
- Document any one-time production step (migrate + seed password) in README.

## Task 4: Auth HTTP surface + route gate

- Mount Better Auth handler: `src/app/api/auth/[...all]/route.ts` (standard catch-all).
- Add Next.js **middleware** (or Next 16 equivalent) that:
  - Allows `/login`, `/api/auth/**`, and necessary static assets
  - Allows `/api/agent/**` **only** for Bearer-key clients (middleware should not block the
    agent route with a cookie check — agent auth stays in the route handler)
  - Redirects all other unauthenticated page requests to `/login` (optionally with
    `callbackUrl`)
- Fail closed: missing secret in production should not silently open the app.

## Task 5: Login page + logout chrome

- Simple `/login` page: email, password, submit; match existing shell fonts/colors (Archivo,
  ink/surface tokens) — no design system expansion.
- On success, redirect to `/outline` (or `callbackUrl` if present and safe/same-origin).
- Logout control: modest link/button in `TabStrip` (or nearby shell) calling Better Auth
  sign-out, then back to `/login`.
- No signup link. No “forgot password” unless free with zero email infra (default: omit).

## Task 6: Wire `getCurrentUserId()` to the session

- Replace hardcoded `DEV_USER_EMAIL` lookup with session resolution:
  - Browser / server actions / RSC: session user id, or throw/redirect if missing
  - Preserve the contract: every mutation already takes `userId` from this function
- Remove or narrow `DEV_USER_EMAIL` to seed-only constants so production never “falls back”
  to an open identity.
- Smoke-check that outline, schedule, notes, and planning actions still resolve the same
  owner after login (same uuid as pre-auth seed user when email unchanged).

## Task 7: Seed / env bootstrap for the owner account

- Extend `src/db/seed.ts` (or a dedicated `db:create-user` script) to:
  - Upsert the owner user by email from env (`AUTH_SEED_EMAIL`, defaulting to
    `dev@localhost` locally if desired)
  - Set/update the Better Auth **account** password hash from `AUTH_SEED_PASSWORD` (required
    in production docs; local default only if safe for personal dev)
  - **Not** delete planner data when only rotating the password
- Document required Vercel env vars and a post-deploy “set password” path.
- Keep sample hierarchy seed optional / separate from credential upsert so production can
  set a password without reloading demo data.

## Task 8: Agent API identity after auth

- Keep `requireAgentApiKey` + envelope standards unchanged.
- After a valid key, resolve owner user id for tools:
  - Prefer env override (`PLANNER_AGENT_USER_EMAIL` or user id) if set
  - Else the same seeded owner email / sole personal account
- Do **not** require a browser session for agent routes.
- Update `agent-os/standards/api/agent-auth.md` identity section: key → owner user after
  Better Auth (not “until Better Auth lands”).
- Unit/integration: invalid key still 401; valid key still scopes tools to that user.

## Task 9: Tests and verification

Per `development/testing`:

- Pure logic for any non-trivial auth helpers (e.g. safe callback URL parsing) → unit tests
- No React component tests for the login form
- Integration: existing cross-user mutation suites still pass; add auth-related DB cases
  only if we own password-hash / session helpers that touch Postgres in our code (don’t
  re-test Better Auth itself)
- Manual / skill-driven: cold visit production-like build → login → edit a note → logout →
  confirm gate
- `npm run test:unit`, integration with Postgres up, typecheck, lint as usual

## Task 10: Docs, freeze spec, update roadmap

- README: remove “⚠️ no authentication” warning; document login, env vars, seed password,
  agent key coexistence
- `tech-stack.md`: mark auth as implemented (Better Auth self-run)
- On verify: update plan/shape for as-built drift; complete **Changes from original plan**;
  set **Status: frozen / complete** (date); list follow-ups as new work
- `agent-os/product/roadmap.md`: mark multi-user accounts & auth as delivered for the
  personal gate (note remaining: invite/second user UX, OAuth, sync polish if any)

### Suggested follow-ups (new work after freeze)

- Second user via seed/script (spouse) without open signup
- Password change UI or reset email when a mail provider exists
- Google OAuth shared with Calendar
- Map multiple agent API keys → users (multi-tenant agents)
- Remote MCP auth story (roadmap medium-term AI)

---

## Implementation map (expected)

| Concern              | Likely location                                                            |
| -------------------- | -------------------------------------------------------------------------- |
| Better Auth instance | `src/lib/auth/` (server config)                                            |
| Session → user id    | `src/lib/auth.ts` or `src/lib/auth/session.ts` — keep `getCurrentUserId()` |
| Auth route           | `src/app/api/auth/[...all]/route.ts`                                       |
| Middleware gate      | `src/middleware.ts` (or Next 16 proxy equivalent)                          |
| Login UI             | `src/app/login/page.tsx`                                                   |
| Logout               | shell / `TabStrip`                                                         |
| Schema               | `src/db/schema.ts` + new migration                                         |
| Seed credentials     | `src/db/seed.ts` and/or small script                                       |
| Agent key            | `src/lib/agent/auth.ts` + tools identity                                   |

## Standards applied

- **development/testing** — logic in lib; integration + cross-user; no component tests
- **api/agent-auth** — Bearer key for agents; update identity mapping post Better Auth
- **api/response-format** — agent envelope unchanged; Better Auth owns its own `/api/auth` responses
- **api/error-handling** — agent `unauthorized` 401; app redirects for browser HTML

## Product alignment

- Roadmap Phase 2 “Multi-user accounts & sync” / Better Auth self-run — **this slice**
- Cost constraint: free tiers only; no paid auth vendor
- Own-your-data: credentials and identity tables stay in our Postgres

## Active-spec rule (for implementer)

While this spec is **active**, when we make a material change to requirements, design, or
scope (including from feedback on what was implemented), update the relevant sections and
append to **Changes from original plan**. Skip pure implementation details. Freeze when
verified.
