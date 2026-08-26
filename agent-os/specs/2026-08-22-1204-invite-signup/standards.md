# Standards for Invite-gated sign-up

**Status: frozen / complete** (2026-08-22)

Key constraints for this slice:

- Every authenticated mutation takes `userId` first and proves ownership. Redeem is
  keyed by invite token and must insert the **new** user's id, never the inviter's.
- Proxy allowlisting `/signup` is not the auth gate; invalid tokens cannot create
  accounts.
- Integration tests: mint/list/revoke scoping, redeem isolation, change-password
  cross-user. Register `listInvites` in `crossUserReads.integration.test.ts`.
- Generate the migration; hand-write only the existing-users `can_invite = true`
  backfill, keeping the snapshot.
- Logic in `src/lib/auth/`; thin actions; no db from components.
- `/signup` matches `/login`; 16px inputs / 44px tap targets; revoke is
  `ConfirmDialog`.

Applied as of standards commit `850fc58`. References, not copies — see AGENTS.md.

- `agent-os/standards/development/security.md`
- `agent-os/standards/development/testing.md`

  See `agent-os/standards/development/testing.md`. Tripwires for this feature:

  - A `can_invite = false` user cannot mint
  - User B cannot list or revoke A's invites
  - Redeeming an invite does not let the new user read A's rows
  - Duplicate email on redeem does not reset the existing password
  - Revoked token is inert; prior accounts keep working
  - Change-password with the wrong current password fails; B's hash is untouched

- `agent-os/standards/database/migrations.md`

  See `agent-os/standards/database/migrations.md`. Generate `can_invite` + `invites`.
  If `db:generate` cannot emit `UPDATE users SET can_invite = true`, append that
  statement with a breakpoint marker and keep the snapshot.

- `agent-os/standards/development/clean-code.md`

  See `agent-os/standards/development/clean-code.md`. Invite/redeem/password live in
  `src/lib/auth/`. Settings and signup actions resolve the user (or not, for redeem)
  and delegate.

- `agent-os/standards/components/ux-principles.md`

  See those files. `/signup` is the login card; inputs are 16px on phone; revoke is
  `ConfirmDialog`. Accessibility-as-compliance is still out; tap targets are not.

- `agent-os/standards/components/responsive.md`
- `agent-os/standards/components/modal-pattern.md`

Deviations: none recorded.

<!-- The standards text was formerly inlined here. It lives in agent-os/standards/
     and, as it stood at freeze, in `git show 850fc58:agent-os/standards/<path>.md`. -->
