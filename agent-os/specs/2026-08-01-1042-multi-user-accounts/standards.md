# Standards for Multi-user accounts + a separate local test identity

**Status: frozen / complete** (2026-08-01)

The one that binds hardest is `development/testing` — this entire
spec is about the mistake that standard names first ("a refactor that drops a `userId` from
a `where` clause"), so its cross-user rule is the acceptance bar, not a suggestion.
`api/agent-auth` is unusual here: it **documents the behaviour being changed**, so it is
edited as part of the work rather than merely obeyed.

Applied as of standards commit `bdf6cf1`. References, not copies — see AGENTS.md.

- `agent-os/standards/development/testing.md`
- `agent-os/standards/api/agent-auth.md`

  **Why it applies:** This spec changes how a valid Bearer key maps to a user —
  `getOwnerUserId()` becomes `getAgentUserId()`, the `AUTH_SEED_EMAIL` fallback is removed,
  and `PLANNER_AGENT_USER_EMAIL` becomes required in production. The **Identity** section
  below is therefore rewritten as part of this work. The mechanism and the "never" list are
  unchanged.

- `agent-os/standards/components/modal-pattern.md`

  **Why it applies:** Disconnecting Google deletes the account link, the calendar links, and
  every mirrored appointment. That is a destructive confirmation — one of the two cases
  `ux-principles` allows a modal at all — so it uses the existing `ConfirmDialog`
  (`role="alertdialog"`, Cancel takes focus) rather than a hand-rolled dialog or a
  `window.confirm`.

- `agent-os/standards/database/migrations.md`

  **Why it applies:** No schema change is expected — provisioning uses columns that already
  exist. The standard is listed because it also owns the `db:seed` rules, and this spec
  changes what `db:seed` is for: its "deletes the dev user's nodes, appointments and time
  charts" warning becomes the reason the script now refuses to run in production. If a
  migration does turn out to be needed, it is generated, never hand-written.

Deviations: none recorded.

<!-- The standards text was formerly inlined here. It lives in agent-os/standards/
     and, as it stood at freeze, in `git show bdf6cf1:agent-os/standards/<path>.md`. -->
