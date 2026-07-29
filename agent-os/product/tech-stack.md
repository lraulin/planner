# Tech Stack

Chosen to run at **$0** on free tiers at personal scale, with minimal ops overhead.

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
`accounts` / `verifications`). Email/password only; public sign-up disabled. Owner account
provisioned by `npm run db:seed` / env credentials.

`getCurrentUserId()` in `src/lib/auth.ts` resolves the Better Auth session. Agent HTTP uses
Bearer `PLANNER_AGENT_API_KEY` → owner user (`getOwnerUserId`), not a browser cookie.

**Neon Auth was considered and declined** (July 2026). The dashboard option is Managed
Better Auth, which creates its tables in a vendor-owned `neon_auth` schema you would
foreign-key against. Identity is what every row in this app points at, so putting it in a
schema we don't control is the deepest form of the lock-in `mission.md` explicitly exists to
avoid — the whole project started because Achieve was abandoned.

## Other

- **Hosting:** Vercel (Hobby tier, free for personal use).
- **Database hosting:** Neon (free tier); Supabase is the fallback. Serverless runtimes must
  use Neon's _pooled_ connection string; migrations use the direct one.
- **Cost constraint:** free tiers are the default. Paid or metered services need a
  justification, and AWS is only in scope for the Phase 3 Bedrock assistant.

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
