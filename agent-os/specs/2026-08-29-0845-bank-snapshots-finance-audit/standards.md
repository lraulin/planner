# Standards

**Status: frozen / complete (2026-08-29)**

Standards commit pinned at freeze: `e52a51566a63d8bb7db3022d74c0921c1ca19eea`.

- `agent-os/standards/database/migrations.md` — generate the schema migration and snapshot;
  include the one-time legacy evidence migration safely.
- `agent-os/standards/development/clean-code.md` — keep reconciliation/checkpoint logic in
  `src/lib`, server actions thin, and use one audit implementation.
- `agent-os/standards/development/security.md` — scope every audit read/write by user and keep
  credentials/full account numbers out of evidence.
- `agent-os/standards/development/testing.md` — pure logic tests plus real-Postgres atomicity
  and cross-user isolation coverage.
- `agent-os/standards/development/dates.md` — distinguish bank calendar dates from capture
  instants and calculate the 36-hour window from instants.
- `agent-os/standards/development/commits.md` — record the model correction and canonical spec.
- `agent-os/standards/components/data-grid.md` — use the shared searchable/filterable grid.
- `agent-os/standards/components/navigation.md` — add Activity through the page registry.
- `agent-os/standards/components/drawer-pattern.md` — use the established read-only drawer.
- `agent-os/standards/components/responsive.md` — list/full-screen-sheet adaptation below `md`.
- `agent-os/standards/global/ux-principles.md` — keep evidence progressive, actionable, and
  legible at both densities.
