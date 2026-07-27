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

Not implemented. Every table carries a `user_id` and every query scopes by it, but
`getCurrentUserId()` in `src/lib/auth.ts` returns a hardcoded dev user. That one function is
the seam; turning on real auth needs no schema migration.

**Neon Auth was considered and declined** (July 2026). The dashboard option is Managed
Better Auth, which creates its tables in a vendor-owned `neon_auth` schema you would
foreign-key against. Identity is what every row in this app points at, so putting it in a
schema we don't control is the deepest form of the lock-in `mission.md` explicitly exists to
avoid — the whole project started because Achieve was abandoned. What it manages for us
(running Better Auth's migrations) is already covered by `db:generate` / `db:migrate`.

**Phase 2 choice: Better Auth, self-run**, with the Drizzle adapter. Same library, tables in
our own schema under our own migrations, portable to any Postgres.

## Other

- **Hosting:** Vercel (Hobby tier, free for personal use).
- **Database hosting:** Neon (free tier); Supabase is the fallback. Serverless runtimes must
  use Neon's _pooled_ connection string; migrations use the direct one.
- **Cost constraint:** free tiers are the default. Paid or metered services need a
  justification, and AWS is only in scope for the Phase 3 Bedrock assistant.
