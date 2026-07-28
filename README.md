# planner

A web reimplementation of [Effexis Achieve Planner](http://www.effexis.com/achieve/planner.htm),
a Windows time-management app that is no longer developed.

The core model is a single hierarchy — **Result Areas → Goals → Projects → Tasks** — with
arbitrary nesting, ABCD priorities, effort tracking, and a weekly schedule built from
time-blocked "project blocks."

See `agent-os/product/` for the mission, roadmap, and tech stack, and `agent-os/specs/` for
individual feature specs.

## Stack

Next.js (App Router) · TypeScript · Tailwind · Drizzle ORM · PostgreSQL

## Setup

```sh
npm install
cp .env.example .env.local   # then fill in DATABASE_URL
npm run db:up                # starts Postgres in Docker
npm run db:migrate           # applies migrations (or db:push while iterating)
npm run db:seed              # creates the dev user and sample data
npm run dev                  # http://localhost:3047
```

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

| Script                | Purpose                                  |
| --------------------- | ---------------------------------------- |
| `npm run dev`         | Dev server on **http://localhost:3047**  |
| `npm start`           | Production server on **:3047** (post-build) |
| `npm run build`       | Production build                         |
| `npm test`            | Unit tests (Vitest)                      |
| `npm run typecheck`   | `tsc --noEmit`                           |
| `npm run lint`        | ESLint                                   |
| `npm run format`      | Prettier                                 |
| `npm run db:up`       | Start local Postgres (Docker)            |
| `npm run db:down`     | Stop local Postgres                      |
| `npm run db:generate` | Generate a migration from schema changes |
| `npm run db:migrate`  | Apply pending migrations                 |
| `npm run db:push`     | Push the schema directly (development)   |
| `npm run db:studio`   | Drizzle Studio                           |
| `npm run db:seed`     | Seed the dev user and sample hierarchy   |

## Deploying

Live at **https://planner-sable-three.vercel.app**, on Vercel Hobby with a Neon database.

> ### ⚠️ The deployed app has no authentication
>
> `getCurrentUserId()` returns a hardcoded dev user, so **anyone with the URL can read and
> edit the outline.** Vercel's Hobby plan cannot protect a production domain — Standard
> Protection covers preview and deployment URLs only; protecting production needs Pro.
>
> This is accepted while the database holds nothing but sample data. It must be resolved
> before real planning data goes in. The options, cheapest first: point the project's
> production branch at a branch you never push and use the protected branch URL with Vercel
> Authentication; or land Better Auth (Phase 2), which is the actual fix.

Hosting targets the free tiers: Vercel Hobby for the app, Neon for Postgres.

1. Create a Neon project named `planner`. Copy the **pooled** connection string — the host
   containing `-pooler`. Serverless functions open a connection per invocation, so the
   pooled endpoint is the one to use.
2. Import this repository into Vercel. The defaults are correct; no build settings need
   changing.
3. Set `DATABASE_URL` in the Vercel project's environment variables to the Neon pooled
   string.
4. Apply the schema and create the dev user, from your machine, against the Neon database:

   ```sh
   DATABASE_URL="<neon-string>" npm run db:migrate
   DATABASE_URL="<neon-string>" npm run db:seed   # optional: adds sample data too
   ```

   Migrations are deliberately not run during the Vercel build — a schema change should be
   an explicit act, not a side effect of deploying.

Vercel's Hobby tier is free but its terms limit it to non-commercial use. If this ever
becomes something you sell, hosting has to move.

## Notes

- **Authentication is not implemented yet.** Every table carries a `user_id` and every query
  scopes by it, but `getCurrentUserId()` returns a hardcoded dev user. This keeps the app
  multi-user ready without an auth flow — see `src/lib/auth.ts`.
- `CLAUDE.md` is a symlink to `AGENTS.md`, so all coding agents read the same instructions.
