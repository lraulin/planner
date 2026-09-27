# Standards for Toasts and one-step bank snapshot paste

Applied as of standards commit `30a9c769`. References, not copies — see AGENTS.md.

- `agent-os/standards/components/modal-pattern.md` — its "no toast" paragraph is what this
  spec replaces; closing a modal stays the success signal, and `ModalShell` (`z-50`) must
  cover the toast outlet.
- `agent-os/standards/components/ux-principles.md` — "immediate feedback", icon-only controls
  need a `title` (the × dismiss), tap targets on phone. Gains a Feedback section.
- `agent-os/standards/components/navigation.md` — a command without a menu row is not shipped,
  so `accounts.pasteSnapshot` gets a menu row and palette entry.
- `agent-os/standards/components/responsive.md` — the outlet sits above the bottom nav and
  safe-area inset on phone.
- `agent-os/standards/development/testing.md` — pure toast queue logic in `src/lib/toast/`
  with a test; no React component tests.
- `agent-os/standards/development/clean-code.md` — "when the model is wrong, change the
  model": migrate every notice rather than leave two conventions.

## Deviations

- `modal-pattern.md` and `ux-principles.md` are edited by this spec (Task 6), because the
  rule they state ("no toasts") is the decision being reversed.
