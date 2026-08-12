# Security hardening + a written security standard

**Status: frozen / complete** (2026-08-12)  
Spec folder: `agent-os/specs/2026-08-12-1316-security-hardening-and-standard/`

This document is the durable record of **what was built and why**. Further security
work should open a new delta-spec rather than treating this file as a living control
plane.

## Context

Real bank transaction data started landing in this app on 2026-08-12 (the Finances CSV
import register, `agent-os/specs/2026-08-12-1048-finances-csv-import-register/`). That
changes the stakes of a public Vercel deployment, so the security posture was audited.

**The application layer held up.** Every finance read and write is `userId`-scoped;
mutations prove ownership before writing (`requireTransaction` / `requireAccount` in
`src/lib/finances/mutations.ts`) rather than trusting a `where` clause to match nothing;
`listAccounts` keeps the user scope on both sides of its join. Five cross-user isolation
tests genuinely attempt read/update/delete as a second user
(`src/lib/finances/mutations.integration.test.ts:157`), and
`src/lib/db/crossUserReads.integration.test.ts` sweeps the repo for dropped `userId`s. The
agent Bearer key is timing-safe and fails closed. The dev bypass is double-gated and cannot
be reached in a production build. No secrets are tracked in git; no finance data is logged;
`rehype-raw` is deliberately absent.

Two audit findings were **withdrawn** after verification — see `references.md` for the
evidence, so they are not re-raised later:

- **HSTS** — Vercel already sets it, on a preloaded domain.
- **Password strength / 2FA** — the account password is 36 random characters from a
  password manager.

`AUTH_DEV_BYPASS` was confirmed unset in Vercel.

**What was left is the perimeter:** no CSP, no clickjacking protection, no dependency
scanning, and a boundary that leaks raw database errors to the browser. This spec closes
those four and writes down the reasoning so the next agent to touch auth or a mutation
inherits it instead of re-deriving it.

## Decisions

1. **CSP: nonce for scripts, `'unsafe-inline'` for styles.** All 29 pages are already
   `force-dynamic`, so nonce-based CSP costs nothing in rendering strategy — its usual
   downside. A strict `style-src` is not viable: FullCalendar positions events with inline
   `style` attributes and there are ~20 `style={{}}` props. Scripts are where XSS actually
   executes, so this is the right split rather than a compromise.
   - `'strict-dynamic'` makes CSP3 browsers ignore `'self'` in `script-src`; `'self'` stays
     as the CSP2 fallback. Documented Next.js pattern.
   - **No nonce in `style-src`** — a nonce present in a directive makes browsers ignore
     `'unsafe-inline'` in that same directive, which would break the calendar.
   - `'unsafe-eval'` in development only (React uses `eval` for server-stack
     reconstruction). `upgrade-insecure-requests` in production only, or local
     `http://localhost:3047` breaks.
2. **Skip database rate-limit storage.** Better Auth's in-memory sign-in limit (3 per 10s)
   is adequate against a 36-character password. Database storage would buy DoS/cost control
   at the price of a table and a write per auth request on Neon's free tier. The standard
   records the triggers that reverse this: a second user, public sign-up, or a password not
   from a manager.
3. **Redact database errors specifically, not a 152-throw refactor.** `src/app/actionResult.ts`
   claimed "Never leak an internal exception string to the client" and then returned
   `error.message` verbatim. A full `UserFacingError` migration would touch 152 throws
   across 33 files and regress every deliberate message. The leak class that matters is
   database errors — they carry table, column, and constraint names. `postgres` exports a
   `PostgresError` class (`name: "PostgresError"`), so this is one narrow check at one
   boundary.
4. **One standard file**, `agent-os/standards/development/security.md`, sized like the
   existing standards. Not a new `security/` category — not enough material.
5. **Dependabot, not CI.** Husky already runs lint/typecheck/unit pre-commit and integration
   pre-push. The gap is dependency drift, which Dependabot closes directly.
6. **Raise `minPasswordLength` to 16.** Costs nothing, prevents a future weak account.
   `MIN_PASSWORD_LENGTH` in `src/lib/auth/provision.ts` stays in sync — it exists precisely
   because the script would otherwise write a row Better Auth refuses to sign in.

## Acceptance criteria

- [x] Every HTML response carries a `Content-Security-Policy` with a per-request nonce in
      `script-src`, and `frame-ancestors 'none'`.
- [x] The app functions with CSP enforced — schedule calendar (FullCalendar drag/resize),
      outline grid, finances register.
- [x] `npm run smoke` passes (all 23 routes).
- [x] Zero CSP violations in the browser console on `/schedule`, `/outline`, `/finances`.
- [x] A `PostgresError` from a server action surfaces as a generic message; a deliberate
      `throw new Error("Transaction not found.")` still surfaces verbatim. Unit-tested.
- [x] Unexpected errors are logged server-side with their real message.
- [x] `agent-os/standards/development/security.md` exists and is in
      `agent-os/standards/index.yml`.
- [x] `.github/dependabot.yml` exists, weekly npm updates.
- [x] `minPasswordLength` is 16 in both auth modules; existing tests pass.
- [x] Lint, typecheck, and the full test suite pass.

## Changes from original plan

| #   | Change                                                                                                                     | Why                                                                                                                                                                                                    |
| --- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Error classification lives in `src/lib/security/safeError.ts` with tests beside it, not in `src/app/actionResult.test.ts`. | The tell (`code` / `PostgresError`) is real logic; `development/testing.md` puts that in `src/lib`. `actionErrorMessage` is a one-line wrapper.                                                        |
| 2   | `safeErrorMessage` takes an optional `fallback`.                                                                           | Import/export routes already had a useful generic ("Import failed.") for non-Error throws. The fallback replaces only a redacted message; a deliberate `Error` still wins.                             |
| 3   | Same redaction applied to Achieve export and the Google settings actions, not only the four import routes.                 | Same leak: a catch returning `error.message` verbatim. Tomboy already used a generic 500 and now logs through the helper.                                                                              |
| 4   | CSP also sets `connect-src 'self'` and, in development only, `ws:` / `wss:`.                                               | Next's HMR client opens a websocket; without this the dev server works and then quietly dies on the first refresh.                                                                                     |
| 5   | Local seed / docs / provision tests use a 16-character dummy (`password12345678`) instead of `password123`.                | Provision enforces the same minimum Better Auth will, so the 11-character local default would fail `db:seed` and the integration suite. Sign-in of an already-provisioned short password is unchanged. |

---

## Task 1: Save spec documentation

This folder: `plan.md` (**Status: active**), `shape.md`, `standards.md`, `references.md`.

**Spec relationships** — this is a **root spec** for security posture. It does not supersede
the finances spec; it is the hardening that spec's data prompted.

## Task 2: CSP and security headers

**`src/proxy.ts`** — generate the nonce here and set the CSP on **both** the request and
response headers. Next.js extracts the nonce by parsing the CSP off the _request_, which is
what makes it apply the nonce to framework and bundle script tags automatically.

Keep the existing auth logic as-is and apply headers to every return path, including the
`/login` redirect. Structure it so the header work wraps the auth decision rather than being
duplicated three times.

Do **not** change the `matcher`. The Next.js docs suggest excluding prefetches, but that
matcher is also the auth gate; narrowing it trades a real property for a trivial one.

```
default-src 'self';
script-src 'self' 'nonce-{nonce}' 'strict-dynamic'{dev: " 'unsafe-eval'"};
style-src 'self' 'unsafe-inline';
img-src 'self' blob: data:;
font-src 'self';
object-src 'none';
base-uri 'self';
form-action 'self';
frame-ancestors 'none';
{prod: "upgrade-insecure-requests;"}
```

**`next.config.ts`** — `headers()` for the static ones: `X-Content-Type-Options: nosniff`,
`Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`,
`Permissions-Policy: camera=(), microphone=(), geolocation=()`.

**No HSTS** — Vercel already sets it, and a weaker hand-rolled value would override the
preload-qualified one.

## Task 3: Stop leaking database errors

**`src/app/actionResult.ts`** — `actionErrorMessage` returns a generic message for database
errors, keeping deliberate messages intact. Detect via `error.name === "PostgresError"`
rather than `instanceof`, which survives duplicate module instances. Log the real error
server-side before redacting.

Shared by `run`, `runWithData`, and `runQuery`, so all three wrappers are fixed at once.
Apply the same redaction to the import route catches (`finances`, `achieve`, `tomboy`,
`rednotebook`), which return `error.message` in a 500.

Add `src/app/actionResult.test.ts`: `PostgresError` redacted, plain `Error` passes through,
non-`Error` gives the generic message.

## Task 4: Password policy

`minPasswordLength: 16` in `src/lib/auth/server.ts`; `MIN_PASSWORD_LENGTH = 16` in
`src/lib/auth/provision.ts`. The existing account is unaffected — the minimum is checked at
provision, not sign-in.

## Task 5: Dependabot

`.github/dependabot.yml`: weekly npm updates against `master`, grouped minor/patch.

## Task 6: Write the security standard

`agent-os/standards/development/security.md` — see `standards.md` in this folder for the
outline and rationale. Add the entry to `agent-os/standards/index.yml`.

## Task 7: Verify, freeze, commit

1. `npm run lint`, `npm run typecheck`, `npm test`.
2. Dev server + `npm run smoke`.
3. **Real browser, console open**: `/schedule` (drag and resize an event — where a bad
   `style-src` shows up), `/outline`, `/finances`. Zero CSP violations.
4. Confirm `<script>` tags carry `nonce=` and the value differs between two loads.
5. Freeze `plan.md` / `shape.md`; fill **Changes from original plan**.
6. Commit per `development/commits.md`; push to `origin/master` — validation happens on the
   deployed iPhone.

## Follow-ups (new work — not amendments to this frozen spec)

- Database-backed auth rate limiting, if a second human user, public sign-up, or a
  non-manager password arrives.
- A `UserFacingError` hierarchy, only if a new leak class appears that `code` /
  `PostgresError` cannot catch.
- Two-factor auth, only if the password stops being a 36-character manager secret.

## Risk

The CSP is the only change that can visibly break the app, and it has a fast feedback loop —
violations are loud in the console and appear immediately on `/schedule`. If enforcement
breaks something subtle on the iPhone, the fallback is `Content-Security-Policy-Report-Only`,
observe, re-enforce: a one-line change to the header name.
