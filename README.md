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
npm run db:push              # applies the schema
npm run db:seed              # creates the dev user and sample data
npm run dev
```

The app runs at http://localhost:3000.

## Scripts

| Script                | Purpose                                    |
| --------------------- | ------------------------------------------ |
| `npm run dev`         | Development server                         |
| `npm run build`       | Production build                           |
| `npm test`            | Unit tests (Vitest)                        |
| `npm run typecheck`   | `tsc --noEmit`                             |
| `npm run lint`        | ESLint                                     |
| `npm run format`      | Prettier                                   |
| `npm run db:up`       | Start local Postgres (Docker)              |
| `npm run db:down`     | Stop local Postgres                        |
| `npm run db:generate` | Generate a migration from schema changes   |
| `npm run db:migrate`  | Apply pending migrations                   |
| `npm run db:push`     | Push the schema directly (development)     |
| `npm run db:studio`   | Drizzle Studio                             |
| `npm run db:seed`     | Seed the dev user and sample hierarchy     |

## Notes

- **Authentication is not implemented yet.** Every table carries a `user_id` and every query
  scopes by it, but `getCurrentUserId()` returns a hardcoded dev user. This keeps the app
  multi-user ready without an auth flow — see `src/lib/auth.ts`.
- `CLAUDE.md` is a symlink to `AGENTS.md`, so all coding agents read the same instructions.
