# References for Multi-user accounts + a separate local test identity

**Status: active**

## Prior specs

### Email + password auth (frozen) — the spec this extends

- **Location:** `agent-os/specs/2026-07-29-1630-email-password-auth/`
- **Relevance:** Built Better Auth with `disableSignUp: true`, the `getCurrentUserId()`
  seam, the middleware gate, and the seed-provisioned single owner. Its `plan.md` states
  the position this spec revisits: _"Multi-user **capability** stays (schema already scopes
  every row by `user_id`); only one account is provisioned for now … Wife / second user
  later is seed-or-script, not open registration."_
- **Key patterns:** the `dev@localhost → dev@example.com` in-place rename inside
  `ensureOwnerCredentials()` — same `users.id`, so every FK survives. That is the exact
  mechanic `--rename-from` generalises.
- **Follow-ups it listed** that this spec closes (provisioning a second user without open
  sign-up) and leaves open (per-user agent API keys, password-change UI).
- **Do not edit that folder.** It is frozen; this is the delta spec.

### Google Calendar sync (frozen) — where the real-data exposure comes from

- **Location:** `agent-os/specs/2026-07-31-2046-google-calendar-sync/`
- **Relevance:** Made sync bidirectional and write-through, which is what turns a linked
  test account into a live path to a real calendar. It also notes
  `accountLinking.allowDifferentEmails: true` is load-bearing _because_ the owner account
  was `dev@example.com` — a detail this spec's rename changes the context for, though the
  setting stays (a linked Google address still need not match the account email).
- **Key patterns:** `src/lib/google/queries.ts` `isGoogleLinked()` shows the `accounts` row
  shape to delete; `src/lib/google/mutations.integration.test.ts` is the suite to extend.

## Code to study

| What                   | Path                                              | Why                                                                                                               |
| ---------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Identity resolution    | `src/lib/auth/owner.ts`                           | The module being split. `getOwnerUserId()` is the whole current story                                             |
| The bypass gate        | `src/lib/auth/dev-bypass.ts` + `.test.ts`         | Unchanged, but its two-independent-gates comment and near-miss tests are the model for `identity.test.ts`         |
| Credential upsert      | `src/db/seed.ts` — `ensureOwnerCredentials()`     | Contains every step `upsertUser()` needs: rename, user upsert, `hashPassword`, credential-account upsert          |
| Agent identity         | `src/lib/agent/tools.ts` — `resolveAgentUserId()` | One-line indirection; the seam where a per-user key would eventually go                                           |
| Google link UI         | `src/components/settings/GoogleCalendarPanel.tsx` | Where Disconnect goes. Its `connect()` comment explains why linking needs a real session                          |
| Destructive confirm    | `src/components/detail/ConfirmDialog.tsx`         | Already wraps `ModalShell` with `role="alertdialog"` and Cancel-takes-focus. Use it, do not hand-roll             |
| Server-action wrapper  | `src/app/settings/actions.ts`                     | The existing `ActionResult` shape and revalidation the disconnect action follows                                  |
| Integration test shape | `src/lib/google/mutations.integration.test.ts`    | `databaseReachable()` gating, fresh user per test, `afterAll` cleanup, and the cross-user block to copy           |
| Session-less settings  | `src/lib/settings/session.ts`                     | Swallows the `getCurrentUserId()` throw so `/login` can render through the root layout — keep that behaviour true |

## External

- **Better Auth** — <https://www.better-auth.com/docs/authentication/email-password>
  - `hashPassword` from `better-auth/crypto` is what makes a script-written `accounts.password`
    row a valid credential login; `minPasswordLength: 8` is set in `src/lib/auth/server.ts`
    and the script must reject shorter passwords itself.
  - The `credential` provider stores `accountId = user.id`, which is what the existing seed
    does and what `upsertUser()` must keep doing.

## Deliberately not referenced

No existing multi-tenant, invitation, or role code exists in this repo to borrow from —
and none is being introduced. Provisioning stays a script precisely so there is nothing new
to secure.
