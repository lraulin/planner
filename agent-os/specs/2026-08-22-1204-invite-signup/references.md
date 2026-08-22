# References for Invite-gated sign-up

**Status: frozen / complete** (2026-08-22)

## Governing specs

### `agent-os/specs/2026-07-29-1630-email-password-auth/`

- **Relationship:** Extends; supersedes "no signup UI" only
- **Relevant decisions:** Better Auth email/password, `disableSignUp: true`, `/login`,
  proxy allowlist, no forgot-password email. This delta adds a gated `/signup` and
  allowlists it on the proxy. The Better Auth handler stays closed.

### `agent-os/specs/2026-08-01-1042-multi-user-accounts/`

- **Relationship:** Extends; supersedes "CLI is the only provisioning path"
- **Relevant decisions:** `upsertUser` / `npm run user:create`, three identity seams,
  cross-user isolation. Follow-up this spec closes: **Invite-code sign-up**. Follow-ups
  that stay open: per-user agent API keys (this slice also closes password-change UI).

### `agent-os/specs/2026-08-12-1316-security-hardening-and-standard/`

- **Relationship:** Extends
- **Relevant decisions:** `minPasswordLength` 16; skip DB rate-limit storage until a
  second human user, public sign-up, or a password not from a manager. This slice has
  second humans and likely non-manager passwords but is **not** public sign-up — decide
  against the full migration; record that in `security.md`.

### `agent-os/specs/2026-07-31-2046-google-calendar-sync/`

- **Relationship:** Extends (Google stays linking, not signup)
- **Relevant decisions:** `disableSignUp` blocks Google from minting a user;
  `allowDifferentEmails` is for linking Lee's Google onto a differently-named planner
  account. Update the "single-owner" comment; do not change the setting.

## Similar implementations

### Account provisioning

- **Location:** `src/lib/auth/provision.ts`, `src/db/create-user.ts`
- **Relevance:** Credential-row shape (`providerId: "credential"`, `accountId = user.id`,
  `hashPassword` from `better-auth/crypto`). Invite redeem must write the same pair
  without the upsert/rename behaviour.
- **Key patterns:** `MIN_PASSWORD_LENGTH` 16 enforced here because Better Auth will not
  see the insert; `normalizeEmail`; `provision.integration.test.ts` for the isolation
  cases to copy.

### Login page and proxy

- **Location:** `src/app/login/page.tsx`, `src/components/auth/LoginForm.tsx`,
  `src/proxy.ts`
- **Relevance:** `/signup` copies the login card; proxy must allow `/signup` the same
  way it allows `/login`. Cookie presence is not the authority — redeem validates the
  token server-side.

### Settings Account panel

- **Location:** `src/components/settings/SettingsPage.tsx` (`AccountPanel`),
  `src/app/settings/actions.ts`, `src/app/settings/page.tsx`
- **Relevance:** Invites and change-password live here. `viaDevBypass` already exists
  for "this identity was not signed in". `ConfirmDialog` is already imported.

### Destructive confirm

- **Location:** `src/components/detail/ConfirmDialog.tsx`
- **Relevance:** Revoke is destructive; Cancel-takes-focus `alertdialog`. Do not
  hand-roll.

### Action wrappers

- **Location:** `src/app/actionResult.ts`
- **Relevance:** Mint/revoke/change-password go through `run` / `runWithData` (need
  the token back). Redeem is unauthenticated, so it cannot use `run()` — a dedicated
  action that does not call `getCurrentUserId()`.

### Integration test harness

- **Location:** `src/lib/auth/provision.integration.test.ts`
- **Relevance:** `databaseReachable()` skip, fresh email per test, `afterAll` delete
  users (cascades invites), cross-user block.

## External

- **Better Auth email/password:** keep `disableSignUp: true`. Do not use
  `auth.api.signUpEmail`. Create rows, then `signIn.email` / `auth.api.signInEmail`.
- **`hashPassword` / `verifyPassword`:** `better-auth/crypto` — same as provisioning.
