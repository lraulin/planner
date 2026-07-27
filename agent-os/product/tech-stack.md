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

## Other

- **Hosting:** Vercel (Hobby tier, free for personal use).
- **Database hosting:** Neon (free tier); Supabase is the fallback. Serverless runtimes must
  use Neon's *pooled* connection string; migrations use the direct one.
- **Cost constraint:** free tiers are the default. Paid or metered services need a
  justification, and AWS is only in scope for the Phase 3 Bedrock assistant.
