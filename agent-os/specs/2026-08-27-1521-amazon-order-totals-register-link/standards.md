# Standards for Amazon order totals and register linking

Applied as of standards commit `91b94c63894ceb565c206327847af2185a9b194d`.
References, not copies — see `AGENTS.md`.

- `agent-os/standards/database/migrations.md` — the new `amazon_orders` summary columns require
  a generated Drizzle migration, snapshot and journal entry.
- `agent-os/standards/development/clean-code.md` — the model correction itself: an order total
  is a stored fact, not a read-time sum. Summary parsing, reconciliation and allocation belong
  in small `src/lib/amazon` modules; components and actions stay wiring.
- `agent-os/standards/development/testing.md` — pure summary/allocation logic gets unit tests
  that fail on a plausible mistake; every new query and mutation gets a real-Postgres
  cross-user test. No React component tests.
- `agent-os/standards/development/security.md` — every evidence mutation proves user ownership;
  no raw account data in fixtures or error messages.
- `agent-os/standards/development/dates.md` — Amazon calendar days stay canonical `YYYY-MM-DD`
  strings and never pass through timezone-dependent parsing.
- `agent-os/standards/components/data-grid.md` — Orders stays the shared persisted DataGrid;
  `Order total` and `Register` are ordinary persisted columns.
- `agent-os/standards/components/drawer-pattern.md` — the review drawer keeps DrawerFooter,
  dirty-close protection and the full-screen compact form.
- `agent-os/standards/components/modal-pattern.md` — the capture preview keeps `ModalShell` and
  holds open on failure with inline feedback.
- `agent-os/standards/components/responsive.md` — 44px compact targets, safe areas, 390×844 and
  desktop verification.
- `agent-os/standards/components/ux-principles.md` — an unreconciled order is shown, not hidden
  behind a plausible-looking number.
- `agent-os/standards/development/commits.md` — logical commits state the root cause and cite
  this spec.

## Deviations

- None beyond the deviation the S&S spec already recorded (exact Amazon charge evidence may
  create one balanced split). This spec does not widen it.
