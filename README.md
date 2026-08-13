# planner

A web reimplementation of [Effexis Achieve Planner](http://www.effexis.com/achieve/planner.htm),
a Windows time-management app that is no longer developed.

The core model is a single hierarchy — **Result Areas → Goals → Projects → Tasks** — with
arbitrary nesting, ABCD priorities, effort tracking, and a weekly schedule built from
time-blocked "project blocks."

See `agent-os/product/` for the mission, roadmap, and tech stack, and `agent-os/specs/` for
individual feature specs. Spec workflow (shape → active updates during implement → freeze):
`agent-os/specs/README.md` and standing rules in `AGENTS.md`.

**Achieve Planner source material** (user manual, workflow/training, online help, FAQ,
file formats) lives in [`docs/achieve-planner/`](docs/achieve-planner/README.md). Use it
when clarifying how the original app worked or was meant to be used.

## Stack

Next.js (App Router) · TypeScript · Tailwind · Drizzle ORM · PostgreSQL

## Agent API

External agents (Grok Build, Claude Code) can read/update the plan via tool-shaped HTTP:

`POST /api/agent/{tool}` with `Authorization: Bearer $PLANNER_AGENT_API_KEY`.

Chat clients that speak MCP (Grok.com custom connectors, Claude) use the same registry:

`POST /api/mcp` with the same Bearer key.

To add Planner in Grok: [grok.com/connectors](https://grok.com/connectors) → New Connector
→ Custom. Name `Planner`. URL `https://planner-lee-5344.vercel.app/api/mcp`.

Grok’s next dialog is OAuth, not an API-key field. After this deploy, either click
**Save & Connect** and let Grok discover the endpoints, or fill:

| Field                  | Value                                                 |
| ---------------------- | ----------------------------------------------------- |
| Client ID              | `planner`                                             |
| Client Secret          | leave empty                                           |
| Authorization Endpoint | `https://planner-lee-5344.vercel.app/oauth/authorize` |
| Token Endpoint         | `https://planner-lee-5344.vercel.app/api/oauth/token` |
| Scopes                 | `planner`                                             |
| Token Auth Method      | none (PKCE only)                                      |

Approve in the browser as your Planner account. The static agent API key still works for
Alfred and `POST /api/agent/*`.

See **[docs/agent-api.md](docs/agent-api.md)** for setup and the tool list. Conversation
prompts and skills live in a separate **`planner-agent`** repo so the agent is not drowned
in this app’s source tree.

## Setup

```sh
npm install
cp .env.example .env.local   # DATABASE_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL
npm run db:up                # starts Postgres in Docker
npm run db:migrate           # applies migrations
npm run db:seed              # local test account + sample data
npm run dev                  # http://localhost:3047 → redirects to /login
```

Default local login after seed: email `test@example.com`, password `password12345678`
(override with `AUTH_DEV_USER_EMAIL` / `AUTH_DEV_USER_PASSWORD`). Public sign-up is
disabled.

`db:seed` provisions **only the local test account**, and refuses to run in production. Real
accounts — yours, or a second person's — are created with:

```sh
npm run user:create -- --email you@example.com --password 'a-strong-password'
```

Keep local development on the test account. It is not just about the local database, which
is sample data anyway: the account you are signed in as is the one whose **Google Calendar**
the app reads and writes, and sync is bidirectional. See
`agent-os/specs/2026-08-01-1042-multi-user-accounts/`.

**Port 3047** is pinned in `package.json` so this app does not fight other local Next apps
on 3000 / 3001 / 3002. Override only if needed: `npx next dev -p <port>`.

### Day-to-day (already set up)

```sh
npm run db:up    # if Postgres isn’t already running
npm run dev      # http://localhost:3047
```

Production-style local run (after `npm run build`):

```sh
npm start        # also http://localhost:3047
```

## Scripts

| Script                     | Purpose                                                                                         |
| -------------------------- | ----------------------------------------------------------------------------------------------- |
| `npm run dev`              | Dev server on **http://localhost:3047**                                                         |
| `npm start`                | Production server on **:3047** (post-build)                                                     |
| `npm run build`            | Production build                                                                                |
| `npm test`                 | Full suite (Vitest)                                                                             |
| `npm run test:unit`        | Unit tests only — no database needed                                                            |
| `npm run test:integration` | Database-backed tests (needs `db:up`)                                                           |
| `npm run typecheck`        | `tsc --noEmit`                                                                                  |
| `npm run lint`             | ESLint (warnings fail too)                                                                      |
| `npm run lint:fix`         | ESLint with `--fix`                                                                             |
| `npm run format`           | Prettier write-all                                                                              |
| `npm run format:check`     | Prettier check (CI-friendly)                                                                    |
| `npm run db:up`            | Start local Postgres (Docker)                                                                   |
| `npm run db:down`          | Stop local Postgres                                                                             |
| `npm run db:generate`      | Generate a migration from schema changes — always use this rather than hand-writing SQL         |
| `npm run db:migrate`       | Apply pending migrations                                                                        |
| `npm run db:push`          | Push the schema with **no migration file** — local scratch only, never Neon                     |
| `npm run db:studio`        | Drizzle Studio                                                                                  |
| `npm run db:seed`          | Local test account + sample data (`SEED_SAMPLE_DATA=0` to skip the wipe). Refuses in production |
| `npm run user:create`      | Create, update, or rename an account — `-- --email … --password … [--rename-from …]`            |

## Testing

Tests split by what they need. Files named `*.integration.test.ts` talk to the local
Postgres; everything else is pure and hermetic. New database-backed tests should follow
that naming so they land in the right bucket automatically.

Integration tests **skip loudly** when Postgres is unreachable rather than failing, so a
stopped container never blocks a commit — see `src/lib/testing/database.ts` for why. An
unset `DATABASE_URL` still fails, because that means the environment was never set up.

What to test and what to skip is written down in
`agent-os/standards/development/testing.md`. The short version: pure logic in `src/lib/**`
and every database mutation (always including a cross-user case), no React component
tests.

## Linting

ESLint runs `eslint-config-next` plus **type-aware** rules from `typescript-eslint`
(`no-floating-promises`, `no-misused-promises`, `await-thenable`, `require-await`,
`no-unnecessary-type-assertion`). Those need type information, so lint is slower than a
stock Next setup — about 5s for the project — and in exchange it catches the class of bug
where a rejected server action leaves the UI silently stuck.

`no-unnecessary-condition` is deliberately off; see the comment in `eslint.config.mjs`.

## Automated checks

Nothing here needs remembering — three hooks run the gates for you:

- **Pre-commit** (`.husky/pre-commit`): Prettier on staged files via lint-staged, then
  `npm run lint`, `npm run typecheck`, and `npm run test:unit` across the project.
  `npm install` installs the hook through the `prepare` script.
- **Pre-push** (`.husky/pre-push`): the full suite, so nothing reaches `origin` without
  the database-backed tests having run.
- **Agent turns**: `.claude/hooks/lint-changed.sh` is a `Stop` hook — when an AI agent
  finishes a turn it lints every uncommitted file in one pass and reports violations back
  for the agent to fix. Turn-end is used rather than per-edit deliberately: it is a
  natural "I meant to leave it this way" boundary, so the agent is never interrupted over
  half-finished intermediate state. A turn that changed no code exits in ~0.2s without
  starting ESLint at all.

## Deploying

Live at **https://planner-lee-5344.vercel.app**, on Vercel Hobby with a Neon database.
Vercel also aliases `planner-sable-three.vercel.app` to the same deployment, but
`BETTER_AUTH_URL` names the first one, and **that is the origin that matters** — see the
Google callback note below.

Authentication is **Better Auth** (email/password, no public sign-up). Unauthenticated
visitors are redirected to `/login`. The agent API uses a separate Bearer key (see above).

Hosting targets the free tiers: Vercel Hobby for the app, Neon for Postgres.

1. Create a Neon project named `planner`. Copy the **pooled** connection string — the host
   containing `-pooler`. Serverless functions open a connection per invocation, so the
   pooled endpoint is the one to use.
2. Import this repository into Vercel. The defaults are correct; no build settings need
   changing.
3. Set environment variables in the Vercel project:

   | Variable                   | Purpose                                                                |
   | -------------------------- | ---------------------------------------------------------------------- |
   | `DATABASE_URL`             | Neon **pooled** string                                                 |
   | `DIRECT_DATABASE_URL`      | Neon **direct** string (migrations on production build)                |
   | `BETTER_AUTH_SECRET`       | `openssl rand -base64 32`                                              |
   | `BETTER_AUTH_URL`          | Production origin, e.g. `https://planner-….vercel.app`                 |
   | `PLANNER_AGENT_API_KEY`    | Optional; for `/api/agent/*` and `/api/mcp`                            |
   | `PLANNER_AGENT_USER_EMAIL` | Account the agent key acts as. **Required** — no default in production |
   | `GOOGLE_CLIENT_ID`         | Optional; Google Calendar + Contacts sync                              |
   | `GOOGLE_CLIENT_SECRET`     | Optional; Google Calendar + Contacts sync                              |

   **The Google callback must match `BETTER_AUTH_URL`, not the URL you browse.** No
   `redirectURI` is set on the provider (`src/lib/auth/server.ts`), so Better Auth builds
   `${BETTER_AUTH_URL}/api/auth/callback/google` — and a Vercel project usually answers on
   several hostnames, only one of which is in that variable. Registering the wrong one
   fails at the very last step with `Error 400: redirect_uri_mismatch`, after everything
   else looks configured. Ask the deployment what it actually sends rather than guessing:

   ```sh
   curl -s -X POST https://YOUR-APP/api/auth/sign-in/social \
     -H 'Content-Type: application/json' \
     -d '{"provider":"google","callbackURL":"/settings"}' | grep -o 'redirect_uri[^&]*'
   ```

   Put exactly that (URL-decoded) into Google Cloud Console → Credentials → your OAuth
   client → Authorised redirect URIs, alongside `http://localhost:3047/api/auth/callback/google`.
   Enable both the **Google Calendar API** and **People API** in the same Cloud project.
   Accounts linked before Contacts sync was added must use **Reconnect Google** in Settings
   once to grant the new read-only Contacts scope.

4. Production builds run pending migrations when `VERCEL_ENV=production` (see
   `scripts/migrate-on-deploy.mjs`). Create or update your account against Neon — this
   touches only the identity rows and never your data:

   ```sh
   DATABASE_URL="<neon-string>" \
   npm run user:create -- --email you@example.com --password 'your-strong-password'
   ```

   To change the address on an existing account without losing anything it owns, add
   `--rename-from old@example.com`. The row keeps its `users.id`, so every node, note,
   appointment and linked Google account comes with it.

Vercel's Hobby tier is free but its terms limit it to non-commercial use. If this ever
becomes something you sell, hosting has to move.

## Notes

- **Auth:** Better Auth email/password; `getCurrentUserId()` reads the session. Three
  identities are resolved separately in `src/lib/auth/identity.ts` — the session user, the
  dev-bypass user (`AUTH_DEV_USER_EMAIL`), and the account agent tools act as
  (`PLANNER_AGENT_USER_EMAIL`, Bearer `PLANNER_AGENT_API_KEY`).
- `CLAUDE.md` is a symlink to `AGENTS.md`, so all coding agents read the same instructions.
