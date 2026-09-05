# Tech Stack

Chosen for minimal ops overhead and a tightly bounded personal-scale cost. Vercel remains
free; Neon is on its metered Launch plan with a $5/month escalation threshold.

## Frontend

- **Next.js** (App Router)
- **React**
- **TypeScript**
- **Tailwind CSS**

## Backend

- **Next.js** server — route handlers and server actions. No separate API service; frontend
  and backend live in one repo.
- **TypeScript**

## Database

- **PostgreSQL**, accessed through **Drizzle ORM** — chosen over Prisma because the outline
  leans heavily on recursive CTEs, which Drizzle expresses directly.
- **Docker Compose** runs Postgres locally, so development never depends on the hosted
  database.

## Authentication

**Better Auth, self-run**, Drizzle adapter, tables in our schema (`users` + `sessions` /
`accounts` / `verifications`). Email/password only; Better Auth's public sign-up handler
stays disabled (`disableSignUp: true`). Accounts are provisioned by `npm run user:create`
(create, update, or rename in place) or by redeeming an invite minted in Settings
(`specs/2026-08-22-1204-invite-signup`). `npm run db:seed` provisions only the local test
account and refuses to run in production.

Three identities are resolved separately in `src/lib/auth/identity.ts`, because collapsing
them once meant an unauthenticated local app writing to a real Google Calendar:

| Identity        | Resolver                                 | Source                                                 |
| --------------- | ---------------------------------------- | ------------------------------------------------------ |
| Session user    | `getCurrentUserId()` (`src/lib/auth.ts`) | Better Auth session cookie                             |
| Dev-bypass user | `getDevUserId()`                         | `AUTH_DEV_USER_EMAIL`, default `test@example.com`      |
| Agent user      | `getAgentUserId()`                       | `PLANNER_AGENT_USER_EMAIL`, **required in production** |

Agent HTTP uses Bearer `PLANNER_AGENT_API_KEY` → agent user, not a browser cookie.

**Neon Auth was considered and declined** (July 2026). The dashboard option is Managed
Better Auth, which creates its tables in a vendor-owned `neon_auth` schema you would
foreign-key against. Identity is what every row in this app points at, so putting it in a
schema we don't control is the deepest form of the lock-in `mission.md` explicitly exists to
avoid — the whole project started because Achieve was abandoned.

## Other

- **Hosting:** Vercel (Hobby tier, free for personal use).
- **Database hosting:** Neon (metered Launch plan); Supabase is the fallback. Serverless
  runtimes use Neon's _pooled_ connection string; migrations and backups use direct,
  least-privilege connections.
- **Recovery:** seven-day Neon PITR, weekly 90-day Neon snapshots, and daily portable GPG
  dumps synchronized to Dropbox from Lee's Mac. See `docs/production-backup-recovery.md`.
- **Cost constraint:** keep the existing $3 spending notification and treat $5 projected
  total Neon spend as the escalation threshold. Backup history plus snapshots targets less
  than $1/month; Dropbox backups survive any provider-side reduction.

### Migrations run as part of the deploy

`npm run build` runs `scripts/migrate-on-deploy.mjs` before `next build`. It applies pending
migrations **only when `VERCEL_ENV=production`**, and is a no-op locally and on previews.

This exists because the two can drift. Shipping the detail-forms work deployed code that
queried `project_details` while Neon had never been migrated past `0000`, so every drawer on
production failed on a missing table. Code and schema now move together, and a failed
migration fails the build rather than deploying code whose tables do not exist.

The `VERCEL_ENV` guard matters: preview deployments share the one Neon database — there is
no branch-per-preview — so an unguarded step would let a push to any branch reshape
production's schema.

Two environment variables in Vercel:

| Variable              | Value                                | Used by                |
| --------------------- | ------------------------------------ | ---------------------- |
| `DATABASE_URL`        | Neon **pooled** (host has `-pooler`) | The app at runtime     |
| `DIRECT_DATABASE_URL` | Neon **direct** (no `-pooler`)       | Migrations, build only |

`drizzle.config.ts` prefers `DIRECT_DATABASE_URL` and falls back to `DATABASE_URL`, so local
development needs only the latter. The direct string matters because a migration is DDL in a
transaction, which is what a transaction-mode pooler handles worst — `ALTER TYPE ... ADD
VALUE` most of all.
