# Invite-gated sign-up

**Status: frozen / complete** (2026-08-22)  
Spec folder: `agent-os/specs/2026-08-22-1204-invite-signup/`

## Spec relationships

- **Extends:** `agent-os/specs/2026-07-29-1630-email-password-auth/` — Better Auth email/password, session gate, `/login`, `disableSignUp: true` on the Better Auth handler.
- **Extends:** `agent-os/specs/2026-08-01-1042-multi-user-accounts/` — `npm run user:create`, three identity seams, per-user isolation. Delivers that spec's follow-up **"Invite-code sign-up"**.
- **Extends:** `agent-os/specs/2026-08-12-1316-security-hardening-and-standard/` — `minPasswordLength` 16; rate-limit trigger is considered and **not** taken as a full Better Auth secondary-storage migration (see Decisions).
- **Extends:** `agent-os/specs/2026-07-31-2046-google-calendar-sync/` — Google remains **linking**, not a sign-up path.
- **Supersedes:** `2026-07-29-1630-email-password-auth` — "Sign-up is not available in the UI" / "No signup link". A gated `/signup` now exists; `/login` still does not advertise it.
- **Supersedes:** `2026-08-01-1042-multi-user-accounts` — "No public sign-up, no invite flow, no admin UI" as the only provisioning path. CLI stays; invite UI is added. `disableSignUp: true` is **not** superseded.

Those frozen folders stay frozen. This delta owns invite mint/redeem, the signup page, `can_invite`, and self-service password change.

## Context

Lee wants friends and family to try the planner without him running `npm run user:create` for each person. Accounts already exist as a data model — almost every table is `user_id`-scoped, and integration tests already prove cross-user isolation. What was missing is a way for a second person to **provision themselves**.

Product alignment:

- **Mission:** multi-user-ready from day one; still personal use. Friends trying it is not a public product launch (no landing page, no terms, no marketing).
- **Roadmap Phase 2 → Platform:** "Invite UI and per-user agent API keys still open." This delivers the invite UI. Per-user agent keys stay out.
- **Tech stack:** Better Auth self-run, tables in our schema. Public Better Auth sign-up stays disabled; a custom invite-gated `/signup` is the only create path besides the CLI.

## Decisions

- **Invite links, not open `/signup`.** Lee mints a URL in Settings and texts it. `/login` has no "create account" link. A visitor who finds `/signup` without a valid token sees a dead state (invalid invite) and a link back to sign-in.
- **Reusable until revoked.** No expiry. One link can onboard several people. Revoke in Settings when done. Use count is displayed, not a cap.
- **Only CLI-provisioned accounts can mint.** `users.can_invite` is `true` for `npm run user:create` (`upsertUser`) and for every account that already exists at migration time (they were all CLI/seed). Invite-created accounts get `false` and never see the Invites panel. Promoting someone later is running `user:create` on their email, which sets `can_invite = true`.
- **Own empty planner.** New accounts are isolated by `user_id` and start with zero nodes, notes, appointments, etc. No sample-data seed. They never see Lee's rows. Sharing/collaboration stays out.
- **Better Auth `disableSignUp` stays `true`.** `POST /api/auth/sign-up/email` must remain closed. Redeem is our code: validate invite → insert user + credential (reuse `provision.ts` hashing) with `can_invite: false` → `signIn.email` with the password they just chose. Do not turn on Better Auth's public sign-up and try to hide the button.
- **Invite token storage.** Capability URL stored like `sessions.token` (unique text, recoverable) so Settings can **copy again**. Tokens are long (32+ bytes, url-safe). Lookup is exact match; revoked rows never redeem. A leaked database already holds session tokens; hashing would prevent copy-from-list, which is the family-sharing UX.
- **No email.** No verification, no forgot-password mail. `emailVerified` stays `true` on insert, matching `upsertUser`. Forgot-password stays out.
- **Change password in Settings → Account.** Current + new + confirm, `minPasswordLength` 16. Prefer Better Auth `changePassword` if it fits the existing credential row; otherwise update the hashed credential the same way `upsertUser` does, after verifying the current password. Dev-bypass sessions cannot change a password they never typed — hide or disable the form when `viaDevBypass`.
- **Google linking unchanged.** Still `linkSocial` from an authenticated session. Update the `allowDifferentEmails` comment that currently says "personal single-owner app": the setting remains because Lee's planner email need not match his Google address; linking is still not a sign-up path.
- **Rate limiting.** The security standard's trigger ("second human user / public sign-up / password not from a manager") is partly true, but this is **not** public sign-up. Do **not** migrate Better Auth to database-backed rate-limit storage in this slice. Mitigations: unguessable invite tokens, generic invalid-invite copy that does not help a scanner, existing in-memory sign-in limit, password min 16. Record the decision in `security.md`: invite-gated second users do not by themselves require DB rate limiting; fully public unauthenticated sign-up still would. Follow-up if an invite URL is posted publicly.
- **CLI remains.** `user:create` is still how Lee provisions himself, the test account, and anyone he wants able to invite.
- **Identity seams unchanged.** Session / dev-bypass / agent stay separate. Agent key still maps to `PLANNER_AGENT_USER_EMAIL`, not to whoever just signed up.

### Out of scope

- Public / unauthenticated sign-up
- Sharing, collaboration, or any cross-user visibility
- Email verification, magic links, forgot-password email
- Per-user agent API keys
- Roles/permissions beyond `can_invite`
- Invite expiry, max-uses, or per-email invites
- Sample / demo data on first login
- OAuth as a sign-up method
- Admin user list / disable / delete-user UI
- Marketing landing page, terms of service
- Lowering `minPasswordLength` (stays 16)

## Acceptance criteria

- [x] Lee (or any `can_invite` account) can mint an invite URL from Settings → Account, copy it then and later, and revoke it
- [x] A person with a valid invite opens `/signup?invite=…`, chooses email + password (≥ 16), and lands in their own empty planner, signed in
- [x] The same invite works for a second person until it is revoked
- [x] After revoke, the URL no longer creates accounts; signed-in people created earlier keep working
- [x] An invite-created account cannot mint invites and does not see that panel
- [x] The new account cannot read, change, or delete Lee's rows (existing isolation plus a signup-created user in the invite integration tests)
- [x] `/login` has no sign-up link; `/signup` without a valid token does not create an account
- [x] `POST /api/auth/sign-up/email` remains disabled (`disableSignUp: true`)
- [x] A signed-in user can change their password from Settings; wrong current password fails; another user is unaffected
- [x] Proxy allows `/signup` without a session cookie; other app routes still redirect to `/login`
- [x] `npm run user:create` still works and yields `can_invite = true`
- [x] Integration tests cover mint/list/revoke scoping, redeem, duplicate email, revoked token, and cross-user isolation of the new account
- [x] `npm run smoke` includes `/signup` (filesystem discovery) and it renders (200, not a bounce to `/login`)
- [x] Browser verification: mint → redeem → empty outline → no owner data → change password → revoke → further signup fails
- [x] Roadmap invite-UI item marked delivered; tech-stack auth paragraph updated; spec frozen

## Changes from original plan

Material refinements during implementation (requirements, design, scope). Omit pure code polish.

| #   | Change                                                                                       | Why                                                                                           |
| --- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| 1   | `MIN_PASSWORD_LENGTH` lives in `passwordPolicy.ts`, not only `provision.ts`                  | Login/signup/change-password forms must not import a module that opens the database           |
| 2   | Redeem signs in via `auth.api.signInEmail` then the client navigates; no server `redirect()` | Avoids swallowing Next's redirect throw in the form's `catch`                                 |
| 3   | Password hint sits outside the `<label>`                                                     | A hint inside the label made `label=New password` match fail and mixed the name with the rule |

## Implementation notes

**Layers.** Invite and signup logic live in `src/lib/auth/` (queries + mutations), not in components. `src/app/**/actions.ts` resolves `userId` and delegates. Every mutation takes `userId` first except the unauthenticated redeem path, which is keyed by the invite token instead — and that path must still insert the new row with the **new** user's id, never the inviter's.

**Schema.**

- `users.can_invite` boolean not null, default false. Generated migration via `npm run db:generate`. Backfill existing users to `true` (SQL in the same migration or a documented follow-up statement — if `generate` cannot emit the backfill, hand-write that statement **and** keep the snapshot, per `database/migrations.md`).
- `invites` table: `id`, `user_id` (minter, FK cascade), `token` unique not null, `created_at`, `revoked_at` nullable, `use_count` int not null default 0. Index on `user_id`.

**Redeem flow.**

1. Guest hits `/signup?invite=TOKEN` (proxy allowlist).
2. Server looks up token; missing/revoked → invalid state, no form that can submit successfully.
3. Submit: validate token again, normalize email, reject duplicate email, enforce password length, insert user (`can_invite: false`, name from local part) + credential hash, increment `use_count`, sign in, redirect to `/plan`.
4. Duplicate email must not reset an existing password.

**Settings.** Extend the existing Account panel (`SettingsPage.tsx` `AccountPanel`): show Invites only when `can_invite`; list active (and maybe revoked, greyed) with copy + revoke; revoke uses `ConfirmDialog` / `role="alertdialog"`. Change-password form below the signed-in email for real sessions.

**UI.** `/signup` matches `/login` (same card, tokens, 16px inputs on phone). LoginForm `minLength={8}` is a pre-existing mismatch with the server's 16; fix the signup form to 16, and fix login's `minLength` while touching auth forms.

**Docs to update at freeze:** `agent-os/product/roadmap.md` (invite UI delivered), `agent-os/product/tech-stack.md` (invite-gated signup; `disableSignUp` still true), `agent-os/standards/development/security.md` (rate-limit trigger clarification), `README.md` if it still says accounts are CLI-only.

## Follow-ups (new work — not amendments to this frozen spec)

- **Per-user agent API keys.** Still one `PLANNER_AGENT_API_KEY` per deployment.
- **Forgot-password email** — needs a mail provider; not started.
- **Database-backed auth rate limiting** if an invite is posted publicly.
- **Invite expiry / max-uses** — declined for this slice; revoke is the control.

> Frozen 2026-08-22. Further change opens a new delta-spec.

---

## Task 1: Save spec documentation

Create `agent-os/specs/2026-08-22-1204-invite-signup/` with:

- **plan.md** — this plan (**Status: active**), including empty **Changes from original plan**
- **shape.md** — shaping notes (scope, decisions, product alignment, out of scope)
- **standards.md** — full text of the confirmed standards (below)
- **references.md** — governing specs and code pointers
- **visuals/** — empty (none provided)

## Task 2: Schema and invite mutations

- Add `users.can_invite` and `invites`; generate migration + snapshot; backfill existing users to `can_invite = true`
- Set `can_invite = true` in `upsertUser`; invite redeem inserts `false`
- `src/lib/auth/` mutations: `createInvite(userId)`, `listInvites(userId)`, `revokeInvite(userId, inviteId)` — prove ownership; `can_invite` required to create
- Integration tests: minter can list/revoke own; other user cannot; `can_invite = false` cannot mint; revoked token is inert

## Task 3: Gated `/signup` (Better Auth sign-up stays closed)

- Keep `emailAndPassword.disableSignUp: true`
- Extract or add a create-only helper next to `upsertUser` that does not update/rename and always sets `can_invite: false`
- `redeemInvite({ token, email, password })` in lib: validate, create, increment uses, return the new user; never a dropped-`userId` write against another account
- `/signup` page + form; proxy allowlist `/signup`; invalid/missing token is a 200 dead state, not a login redirect
- After success, `signIn.email` and redirect to `/plan`
- Unit/integration: valid redeem isolates data; second redeem on same token works; duplicate email fails; revoked fails; Better Auth sign-up API still disabled

## Task 4: Settings — invites + change password

- Account panel: Invites block for `can_invite` (create, copy URL using app origin / `BETTER_AUTH_URL`, revoke with confirm)
- Change-password form for real sessions; 16-char minimum; integration test for success, wrong current, and cross-user
- Hide/disable password change under `AUTH_DEV_BYPASS`
- Update Google `allowDifferentEmails` comment

## Task 5: Verify, freeze spec, update roadmap

- Confirm acceptance criteria in the browser (run-planner): mint, incognito signup, empty outline, isolation, change password, revoke
- `npm run test:unit` and integration (Postgres up — no skip warning on the new files); `npm run smoke` with `/signup` rendering
- Update plan/shape for any material as-built drift; complete **Changes from original plan**
- Mark files **Status: frozen / complete** (date); list leftover ideas as follow-ups (new work)
- Update `agent-os/product/roadmap.md` (invite UI delivered; per-user agent keys still open)
- Update `agent-os/product/tech-stack.md` and `development/security.md` as decided

---

## Standards applied (confirmed)

Include full text in spec `standards.md` at Task 1:

1. **development/security** — every mutation takes `userId` and proves ownership; proxy is not the only gate (`/signup` allowlisted but redeem is server-side); three identities stay separate; hash/timing-safe comparison for secrets; rate-limit trigger recorded as _not_ forcing DB storage for invite-gated signup
2. **development/testing** — lib tests beside the code; invite/redeem/password mutations get `*.integration.test.ts` with a second user failing to read/change/delete
3. **database/migrations** — `db:generate`, commit SQL + snapshot + journal together; hand-write only the `can_invite` backfill if generate cannot emit it, then keep the snapshot
4. **development/clean-code** — logic in `src/lib/auth/`; thin actions; no db from components
5. **components/ux-principles** — `/signup` matches `/login`; dangerous revoke is confirmed; no new design system
6. **components/responsive** — 16px inputs, 44px tap targets on the signup/settings forms
7. **components/modal-pattern** — revoke uses `ConfirmDialog` / `ModalShell` `alertdialog`

Skipped: agent-auth, data-grid, navigation, date-model, api/response-format (no new JSON envelope API unless redeem is a route handler — prefer a server action).
