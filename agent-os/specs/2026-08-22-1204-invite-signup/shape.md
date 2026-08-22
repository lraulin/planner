# Invite-gated sign-up — Shaping Notes

**Status: frozen / complete** (2026-08-22)

## Scope

Friends and family can create their own accounts by redeeming an invite link Lee mints
in Settings. Each new account is an isolated empty planner. Better Auth's public sign-up
endpoint stays closed. Self-service password change is in, because invitees cannot run
the CLI.

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
- Database-backed Better Auth rate-limit storage

## Decisions

- Invite links minted in Settings, reusable until revoked, no expiry
- `/login` does not advertise sign-up; `/signup` without a valid token is a dead state
- `users.can_invite`: CLI/`upsertUser` and existing rows at migration → true; invite
  signup → false. Promote later with `user:create`
- Empty isolated workspace; no sample seed
- `disableSignUp: true` stays; custom redeem writes the credential rows then signs in
- Invite token stored recoverable (like `sessions.token`) so Settings can copy again
- No email infra: `emailVerified` true on insert, matching `upsertUser`
- Change password in Settings Account for real sessions; hidden under dev bypass
- Google remains `linkSocial` only; `allowDifferentEmails` comment updated
- Rate-limit trigger is considered and not taken: unguessable tokens + min 16 + existing
  in-memory sign-in limit. Record in `security.md` that invite-gated second users do not
  by themselves require DB rate limiting
- Identity seams unchanged; agent key still maps to `PLANNER_AGENT_USER_EMAIL`

## Context

- **Visuals:** None. Match existing `/login` card and Settings Account panel.
- **References:** See `references.md`.
- **Product alignment:** Mission stays personal-use; this is the Phase 2 Platform
  "Invite UI" item. Per-user agent keys stay open. Tech stack: Better Auth self-run;
  public handler stays disabled.

## Standards Applied

- `development/security` — scoping, proxy vs session gate, identities, rate-limit trigger
- `development/testing` — invite/redeem/password integration tests with a second user
- `database/migrations` — generate `can_invite` + `invites`; hand-write the backfill
- `development/clean-code` — logic in `src/lib/auth/`; thin actions
- `components/ux-principles` — `/signup` matches `/login`; revoke is confirmed
- `components/responsive` — 16px inputs, 44px tap targets
- `components/modal-pattern` — revoke uses `ConfirmDialog` / `alertdialog`
