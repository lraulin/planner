# Standards for Weekly Schedule

**Status: frozen / complete** (2026-07-28)

The following standards applied to this work. Note: the **Time Chart editor** shipped as a
full page, not a drawer — drawers apply to **appointments** only. See `plan.md`.

Applied as of standards commit `b39d49a`. References, not copies — see AGENTS.md.

- `agent-os/standards/components/ux-principles.md`

  **Why it applies:** Appointment create/edit uses drawers (not Achieve’s stacked modals).
  Keyboard-first, progressive disclosure, and ConfirmDialog for destructive / dirty-close
  apply on the schedule surface. The Time Chart editor is a full-page sub-route (Achieve’s
  separate window), which is still consistent with “no modal for routine editing.”

- `agent-os/standards/components/drawer-pattern.md`

  **Why it applies:** Appointment Information uses the same right-sliding drawer pattern as
  node detail forms — guard content, dirty close, server actions returning `{ ok, error }`,
  revalidate layout. (Time Chart areas edit on the full-page editor + side panel, not here.)

Deviations: none recorded.

<!-- The standards text was formerly inlined here. It lives in agent-os/standards/
     and, as it stood at freeze, in `git show b39d49a:agent-os/standards/<path>.md`. -->
