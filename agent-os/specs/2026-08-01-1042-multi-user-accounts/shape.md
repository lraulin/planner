# Multi-user accounts + a separate local test identity — Shaping Notes

**Status: frozen / complete** (2026-08-01)  
Authoritative detail: `plan.md` (including **Changes from original plan**).

## Scope

Stop local development from running as an account that can reach real data, and give the
app a real way to have more than one account.

### In scope

- Three distinct identity seams — session user, dev-bypass user, agent user — resolved
  independently, with a test-account default outside production and fail-closed behaviour
  inside it
- `npm run user:create`: idempotent create / update / **rename-in-place** of an account
- `db:seed` demoted to a local test bootstrap that refuses to run in production
- **Disconnect Google** from Settings — the missing inverse of the existing link action
- The signed-in account shown in Settings
- Local cutover to `test@example.com`; production rename to `leeraulin@gmail.com`

### Out of scope

- Invite-code or public sign-up — `disableSignUp: true` stays
- Roles, permissions, ownership, or an admin surface
- Per-user agent API keys — one key per deployment, still mapping to one configured user
- Account/profile editing UI (change email or password from inside the app)
- Sharing, collaboration, or cross-user visibility of any kind
- Actually provisioning a spouse account — the command ships, the account is a later choice

## Decisions

- **Separate the three identities rather than reconfigure the one.** Pointing
  `PLANNER_AGENT_USER_EMAIL` at a test account was already possible and would have fixed
  today's symptom. It would not have stopped the next collapse, because one function would
  still be answering three questions.
- **The default is the fix, not the config.** An unset `AUTH_DEV_USER_EMAIL` resolves to
  `test@example.com` — an account that is either a test account or absent. Missing-and-throws
  is an acceptable outcome; silently-real is not.
- **Fail closed in production.** `agentUserEmail()` throws when `PLANNER_AGENT_USER_EMAIL` is
  unset in production, replacing a silent `dev@example.com` default.
- **Rename in place, never delete and recreate.** Preserves `users.id`, every scoped row, and
  the linked Google account. Generalises the existing `dev@localhost` migration.
- **A CLI, not a UI.** Provisioning happens a handful of times ever; a public sign-up
  endpoint or an admin panel would be permanent surface bought for a rare act. The command
  covers the test account, the owner rename, and a spouse account later.
- **Disconnect deletes mirrored appointments.** Keeps a later re-link idempotent instead of
  duplicating every event; Google still holds them.
- **Keep the dev bypass.** It exists because the `run-planner` browser driver starts cold
  every run. Removing it would trade a data-safety problem for a tooling problem — repointing
  it solves the actual complaint.

### How the scope moved during shaping

The request opened with "running locally uses my real data even though it logs in with
`dev@example.com`", read at first as the local database holding real content. Checking the
database corrected that: local is genuinely sample data, one user, 40 nodes. The real
exposure was narrower and worse — a `google` row in `accounts` and `sync_enabled = true` on
the primary calendar, i.e. a bidirectional write path to a real calendar from an
unauthenticated local app.

That reframed the work from "protect the local database" to "make the local identity
genuinely separate", which is the same fix the second half of the request ("might as well
enable multi-user accounts now") was already asking for.

## Context

- **Visuals:** None. The only UI additions are a Disconnect button in the existing Google
  panel and the signed-in email in the Settings header.
- **References:** See `references.md` — the frozen email/password auth spec, the Google
  Calendar sync spec, and the integration-test shape to copy.
- **Product alignment:** `mission.md` states the system is built _"multi-user ready from the
  start … Multi-user features are not activated in the MVP."_ This activates provisioning
  without activating sign-up. Roadmap Phase 2 → Platform already carries the auth item as
  delivered with _"second-user invite UI and OAuth still open"_; this narrows that to the
  invite UI.

## Standards applied

- `development/testing.md` — a dropped `userId` is the exact mistake this spec is about;
  new database logic gets an integration test including the cross-user case
- `api/agent-auth.md` — documents the agent identity resolution being changed here, so the
  standard is edited as part of the work
- `components/modal-pattern.md` — the disconnect confirmation is destructive, so
  `ConfirmDialog` / `role="alertdialog"`
- `database/migrations.md` — no schema change expected; generated, never hand-written, if one
  appears
