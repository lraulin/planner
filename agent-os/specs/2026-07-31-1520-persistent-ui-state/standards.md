# Standards for Persistent UI State + Unified Grid Controls

**Status: frozen / complete** (2026-07-31)

Applied as of standards commit `183b9ad`. References, not copies — see AGENTS.md.

- `agent-os/standards/database/migrations.md`

  **Why it applies:** this spec adds the first new table in a while (`user_settings`). The
  standard exists because a single missing snapshot once made `db:generate` unusable for five
  migrations — so the migration must be generated, not hand-written, and the `.sql`, snapshot
  and journal entry must land in one commit.

- `agent-os/standards/development/testing.md`

  **Why it applies:** the load-bearing logic here is pure and lives in `src/lib/settings/` and
  `src/lib/grid/` — defensive parsing of a user-editable blob, the pending-write queue, and
  sorting rows within group segments, all places where a wrong answer looks plausible. The new
  mutations touch the database, so the cross-user case is mandatory. Everything else in this
  spec is React components, which are explicitly not tested.

- `agent-os/standards/components/ux-principles.md`

  **Why it applies:** this spec touches the grid + drawer core the whole app is built on.
  Relevant here: inline editing for grid-visible fields (persistence must not change what is
  editable where), modals reserved for destructive confirmations (the reset flows), and
  "performance is UX" — the settings provider sits above every grid and must not re-render
  them on each keystroke of a filter.

- `agent-os/standards/components/modal-pattern.md`

  **Why it applies:** the per-scope and global reset confirmations on `/settings` are
  destructive, so they need `role="alertdialog"` on `ModalShell` — and dropping the role would
  silently break the quick-capture guard, which finds dialogs by exactly that selector. The
  Show Fields dialog, gaining a reset footer in Task 9, is governed by the same standard.

- `agent-os/standards/components/drawer-pattern.md`

  **Why it applies:** Task 8 moves the detail drawer's open state into the URL. The standard's
  close flow — "reset open, selected node, and dirty state in one action" — is exactly what a
  URL-driven drawer can get wrong, since the param becomes a fourth thing to keep in sync.

Deviations: none recorded.

<!-- The standards text was formerly inlined here. It lives in agent-os/standards/
     and, as it stood at freeze, in `git show 183b9ad:agent-os/standards/<path>.md`. -->
