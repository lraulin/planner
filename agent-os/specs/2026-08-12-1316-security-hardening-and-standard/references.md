# References — Security hardening

## Code the audit read

| Path                                              | Why                                                                   |
| ------------------------------------------------- | --------------------------------------------------------------------- |
| `src/proxy.ts`                                    | Cookie-presence gate; where the CSP nonce has to be generated         |
| `src/lib/auth.ts` → `getCurrentAccount`           | The real session check every page and action goes through             |
| `src/lib/auth/server.ts`                          | Better Auth config — `disableSignUp`, `minPasswordLength`, linking    |
| `src/lib/auth/identity.ts`                        | Session / dev / agent identities kept separate, defaults never real   |
| `src/lib/auth/dev-bypass.ts`                      | The two independent gates on the local login bypass                   |
| `src/lib/agent/auth.ts` → `requireAgentApiKey`    | Timing-safe Bearer comparison, fails closed when unset                |
| `src/app/actionResult.ts`                         | `actionErrorMessage` — the leak this spec fixes                       |
| `src/lib/finances/{queries,mutations}.ts`         | `userId` scoping and pre-write ownership checks                       |
| `src/lib/finances/mutations.integration.test.ts`  | Five second-user isolation cases (`:157`)                             |
| `src/lib/db/crossUserReads.integration.test.ts`   | Repo-wide sweep for dropped `userId` — the standard's enforcement arm |
| `src/app/api/finances/import/route.ts`            | Size caps + the 500 that returns `error.message`                      |
| `src/components/notes/MarkdownPreviewBody.tsx`    | Why `rehype-raw` is deliberately absent                               |
| `src/components/schedule/TimeChartEditorView.tsx` | FullCalendar — the reason `style-src` cannot be strict                |

## Related specs

### `agent-os/specs/2026-08-12-1048-finances-csv-import-register/`

- **Relationship:** context, **not** `Extends`. That spec put real financial data in the
  app, which is what made this hardening worth doing. No decision in it is superseded here.
- **Carried forward:** its `userId`-scoping and two-user test discipline become the written
  rule in `development/security.md` rather than a per-module habit.

## External sources

| Source                                                                          | What it settled                                                                                              |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| [Next.js CSP guide](https://nextjs.org/docs/app/guides/content-security-policy) | Nonce goes on request **and** response headers; nonce requires dynamic rendering; `'strict-dynamic'` pattern |
| [Vercel encryption & TLS](https://vercel.com/docs/cdn-security/encryption)      | `.vercel.app` HSTS default and preload status                                                                |
| [Better Auth options](https://www.better-auth.com/docs/reference/options)       | `rateLimit` defaults and storage modes; session `expiresIn` / `updateAge`                                    |
| `node_modules/better-auth/dist/api/rate-limiter/index.mjs:370`                  | The undocumented default special rule: `/sign-in` is 3 per 10s                                               |

## Findings raised and then withdrawn

Recorded so they are not re-raised. Both looked like real gaps from the code alone.

### HSTS is missing — **withdrawn**

There is no `Strict-Transport-Security` header in `next.config.ts` and no `vercel.json`, so
from the repo it reads as absent. Vercel sets it automatically:
`max-age=63072000; includeSubDomains; preload` on `.vercel.app`, and `.vercel.app` is itself
on the browser HSTS preload list. Adding our own would risk **overriding** the
preload-qualified value with something weaker. Correct action: none.

### Password is single-factor with an 8-character minimum — **withdrawn as a live risk**

`minPasswordLength: 8` is what the config permits, not what is in use. The account password
is 36 random characters from 1Password, which closes brute force and credential stuffing;
Better Auth's in-memory 3-per-10s sign-in limit is sufficient on top of that. The minimum
was still raised to 16 as policy hygiene (a future account should not be able to be weak),
but no 2FA and no database-backed rate limiting are warranted. What would reverse this: a
second human user, public sign-up, or a password not from a manager.

### `AUTH_DEV_BYPASS` might be set in Vercel — **withdrawn**

Confirmed unset by the owner. It is inert in a production build regardless
(`src/lib/auth/dev-bypass.ts` gates on build-time `NODE_ENV` first), so this was
belt-and-braces.

## Dependency audit at time of writing (2026-08-12)

`npm audit`: 8 vulnerabilities, 4 high — `brace-expansion`, `js-yaml`, `nanoid`, `postcss`,
`sharp` (via `next`), and `esbuild` (via `drizzle-kit`). **All build- or dev-time.** `sharp`
never loads because `next/image` is unused. Recorded as the baseline the standard's triage
rule is written against: the dependency that actually matters at runtime is `next` itself.
