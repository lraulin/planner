# Standards for Amazon Subscribe & Save bills and charge matching

Applied as of standards commit `91b94c63894ceb565c206327847af2185a9b194d`.
References, not copies — see `AGENTS.md`.

- `agent-os/standards/database/migrations.md` — new receipt-evidence tables require a generated
  Drizzle migration, snapshot and journal entry.
- `agent-os/standards/components/ux-principles.md` — paste is transient capture; durable match
  editing preserves Orders context.
- `agent-os/standards/components/navigation.md` — import and review commands need File/Item menu
  homes and a compact tappable path.
- `agent-os/standards/components/data-grid.md` — Orders remains the shared persisted DataGrid.
- `agent-os/standards/components/modal-pattern.md` — capture preview uses `ModalShell` and keeps
  failures open with inline feedback.
- `agent-os/standards/components/drawer-pattern.md` — persistent review uses DrawerFooter,
  dirty-close protection and full-screen compact form.
- `agent-os/standards/components/responsive.md` — 44px compact targets, safe areas, 390×844 and
  desktop verification.
- `agent-os/standards/development/clean-code.md` — parsing/matching/allocation belong in small
  `src/lib` modules; components and actions remain wiring.
- `agent-os/standards/development/security.md` — every evidence mutation proves user ownership;
  raw account data never enters fixtures or errors.
- `agent-os/standards/development/testing.md` — pure logic and real-Postgres isolation tests;
  no React component tests.
- `agent-os/standards/development/dates.md` — Amazon calendar days stay canonical `YYYY-MM-DD`
  strings and never pass through timezone-dependent parsing.
- `agent-os/standards/development/commits.md` — logical commits explain receipt evidence and
  automatic-split invariants and cite this spec.

## Deviations

- `2026-08-26-2022-split-transactions` deliberately prohibited automatic splits. This spec's
  exact Amazon charge evidence is the narrow, recorded exception; finance rules and ordinary
  imports still never create splits.
