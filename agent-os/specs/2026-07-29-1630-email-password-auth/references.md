# References for Email / password authentication

## Similar Implementations

### Identity seam (`getCurrentUserId`)

- **Location:** `src/lib/auth.ts`
- **Relevance:** Every page and server action resolves the current user here. Replacing the
  hardcoded `dev@localhost` lookup with a session is the core switch; callers stay unchanged.
- **Key patterns:** Single async function returning `userId: string`; throws if identity
  cannot be resolved.

### Multi-user schema + mutations

- **Location:** `src/db/schema.ts` (`users` + `user_id` FKs), `src/lib/**/mutations.ts`
- **Relevance:** Auth must preserve existing `users.id` UUIDs so outline/notes/schedule data
  remains owned by the same row after adding password credentials.
- **Key patterns:** Every mutation takes `userId` and scopes `where`; integration tests prove
  cross-user isolation.

### Agent Bearer auth

- **Location:** `src/lib/agent/auth.ts`, `src/lib/agent/tools.ts` (`resolveAgentUserId`),
  `src/app/api/agent/[tool]/route.ts`
- **Relevance:** Machine clients have no cookies. After browser auth, agent tools must not
  call session-only `getCurrentUserId()`; keep key check and map to owner user separately.
- **Key patterns:** Fail closed if `PLANNER_AGENT_API_KEY` unset; envelope + error codes.

### Seed / owner account

- **Location:** `src/db/seed.ts`
- **Relevance:** Upsert owner user by email; must also upsert Better Auth credential account
  (hashed password) without always wiping planner data.

### Shell chrome

- **Location:** `src/components/shell/TabStrip.tsx`
- **Relevance:** Natural place for a modest logout control.

### Product / stack decisions

- **Location:** `agent-os/product/tech-stack.md`, `roadmap.md`, frozen AI spec
  `2026-07-29-1500-ai-interoperability` (follow-up: map API key → real user after Better Auth)
