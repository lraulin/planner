# Standards for Still needed this month

Applied as of standards commit `a1645dc6cde7`. References, not copies — see `AGENTS.md`.
Recover exactly what applied with
`git show a1645dc6cde7:agent-os/standards/<path>`.

- `agent-os/standards/components/ux-principles.md` — the figure lives in existing summary
  chrome and its derivation in a `<details>` disclosure; no modal, no new page.
- `agent-os/standards/components/responsive.md` — the header becomes a pair of figures that
  must wrap legibly below `md` without a separator that breaks on the wrap.
- `agent-os/standards/development/clean-code.md` — the arithmetic goes in `src/lib/**` and the
  component receives it computed; `underfundedGapCents` is redefined in terms of the new
  function so one concern keeps one implementation (D1).
- `agent-os/standards/development/testing.md` — `stillNeeded` is pure logic and gets a
  `plan.test.ts` case beside it; no React component tests; no `*.integration.test.ts` because
  no query or mutation is added and nothing touches the database.
- `agent-os/standards/development/commits.md` — one logical change per commit; imperative
  subject naming the effect.

Deliberately not applied:

- `agent-os/standards/components/data-grid.md` — no grid, column, filter or toolbar change.
- `agent-os/standards/components/drawer-pattern.md`, `components/modal-pattern.md` — no
  drawer or dialog.
- `agent-os/standards/development/security.md` — no new mutation or query, so no new `userId`
  boundary. The figure is derived from data the page has already loaded and scoped.
- `agent-os/standards/api/*` — no HTTP route; server component plus existing props.
- `agent-os/standards/development/dates.md` — month keys are handled entirely by existing
  helpers (`monthKeyOf`, `assignScanInputs`); no new date arithmetic is introduced.

## Deviations

None.
