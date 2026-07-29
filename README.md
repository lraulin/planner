# planner

A web reimplementation of [Effexis Achieve Planner](http://www.effexis.com/achieve/planner.htm),
a Windows time-management app that is no longer developed.

The core model is a single hierarchy — **Result Areas → Goals → Projects → Tasks** — with
arbitrary nesting, ABCD priorities, effort tracking, and a weekly schedule built from
time-blocked "project blocks."

See `agent-os/product/` for the mission, roadmap, and tech stack, and `agent-os/specs/` for
individual feature specs. Spec workflow (shape → active updates during implement → freeze):
`agent-os/specs/README.md` and standing rules in `AGENTS.md`.

## Stack

Next.js (App Router) · TypeScript · Tailwind · Drizzle ORM · PostgreSQL

## Agent API

External agents (Grok Build, Claude Code) can read/update the plan via tool-shaped HTTP:

`POST /api/agent/{tool}` with `Authorization: Bearer $PLANNER_AGENT_API_KEY`.

See **[docs/agent-api.md](docs/agent-api.md)** for setup and the tool list. Conversation
prompts and skills live in a separate **`planner-agent`** repo so the agent is not drowned
in this app’s source tree.

## Setup

```sh
npm install
cp .env.example .env.local   # DATABASE_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL
npm run db:up                # starts Postgres in Docker
npm run db:migrate           # applies migrations (or db:push while iterating)
npm run db:seed              # owner credentials + sample data (login: see .env.example)
npm run dev                  # http://localhost:3047 → redirects to /login
```

Default local login after seed: email `dev@example.com`, password `password123` (override with
`AUTH_SEED_EMAIL` / `AUTH_SEED_PASSWORD`). Public sign-up is disabled.

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

| Script                     | Purpose                                                                                 |
| -------------------------- | --------------------------------------------------------------------------------------- |
| `npm run dev`              | Dev server on **http://localhost:3047**                                                 |
| `npm start`                | Production server on **:3047** (post-build)                                             |
| `npm run build`            | Production build                                                                        |
| `npm test`                 | Full suite (Vitest)                                                                     |
| `npm run test:unit`        | Unit tests only — no database needed                                                    |
| `npm run test:integration` | Database-backed tests (needs `db:up`)                                                   |
| `npm run typecheck`        | `tsc --noEmit`                                                                          |
| `npm run lint`             | ESLint (warnings fail too)                                                              |
| `npm run lint:fix`         | ESLint with `--fix`                                                                     |
| `npm run format`           | Prettier write-all                                                                      |
| `npm run format:check`     | Prettier check (CI-friendly)                                                            |
| `npm run db:up`            | Start local Postgres (Docker)                                                           |
| `npm run db:down`          | Stop local Postgres                                                                     |
| `npm run db:generate`      | Generate a migration from schema changes                                                |
| `npm run db:migrate`       | Apply pending migrations                                                                |
| `npm run db:push`          | Push the schema directly (development)                                                  |
| `npm run db:studio`        | Drizzle Studio                                                                          |
| `npm run db:seed`          | Upsert owner password + optional sample data (`SEED_SAMPLE_DATA=0` to skip sample wipe) |

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

Live at **https://planner-sable-three.vercel.app**, on Vercel Hobby with a Neon database.

Authentication is **Better Auth** (email/password, no public sign-up). Unauthenticated
visitors are redirected to `/login`. The agent API uses a separate Bearer key (see above).

Hosting targets the free tiers: Vercel Hobby for the app, Neon for Postgres.

1. Create a Neon project named `planner`. Copy the **pooled** connection string — the host
   containing `-pooler`. Serverless functions open a connection per invocation, so the
   pooled endpoint is the one to use.
2. Import this repository into Vercel. The defaults are correct; no build settings need
   changing.
3. Set environment variables in the Vercel project:

   | Variable                | Purpose                                                 |
   | ----------------------- | ------------------------------------------------------- |
   | `DATABASE_URL`          | Neon **pooled** string                                  |
   | `DIRECT_DATABASE_URL`   | Neon **direct** string (migrations on production build) |
   | `BETTER_AUTH_SECRET`    | `openssl rand -base64 32`                               |
   | `BETTER_AUTH_URL`       | Production origin, e.g. `https://planner-….vercel.app`  |
   | `AUTH_SEED_EMAIL`       | Your login email                                        |
   | `AUTH_SEED_PASSWORD`    | Your login password (used only by seed, not runtime)    |
   | `PLANNER_AGENT_API_KEY` | Optional; for `/api/agent/*`                            |

4. Production builds run pending migrations when `VERCEL_ENV=production` (see
   `scripts/migrate-on-deploy.mjs`). After the first auth deploy, set the owner password
   against Neon **without** wiping data:

   ```sh
   DATABASE_URL="<neon-string>" \
   AUTH_SEED_EMAIL="you@example.com" \
   AUTH_SEED_PASSWORD="your-strong-password" \
   SEED_SAMPLE_DATA=0 \
   npm run db:seed
   ```

Vercel's Hobby tier is free but its terms limit it to non-commercial use. If this ever
becomes something you sell, hosting has to move.

## Notes

- **Auth:** Better Auth email/password; `getCurrentUserId()` reads the session. Agent tools
  use Bearer `PLANNER_AGENT_API_KEY` → owner user (`src/lib/auth/owner.ts`).
- `CLAUDE.md` is a symlink to `AGENTS.md`, so all coding agents read the same instructions.
