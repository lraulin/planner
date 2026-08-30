# Standards for Overassigned Available

Applied as of standards commit `8f9b8adc8388a62e4269b6a204ced15cde59a301`. Shaped at repo
HEAD `8f9b8adc8388a62e4269b6a204ced15cde59a301`.

**References, not copies** — see `AGENTS.md`. Recover the exact text that applied with
`git show 8f9b8adc:agent-os/standards/<path>`.

## Applicable standards

- `agent-os/standards/components/ux-principles.md` — the scan has to be readable at a
  glance; overassigned vs on-target is that job.
- `agent-os/standards/components/modal-pattern.md` — Fix This stays a `ModalShell`. Unmount
  on close so the next open starts clean.
- `agent-os/standards/components/responsive.md` — Budget is used on the phone; Available
  pill stays `min-h-tap`. No new amount field in this spec.
- `agent-os/standards/development/testing.md` — the state machine lives in `src/lib/**`
  with tests beside it. No React component tests.
- `agent-os/standards/development/clean-code.md` — one `envelopeIndicator`; one pill visual
  shared by the grid button and the Fix This row.
- `agent-os/standards/development/commits.md` — imperative subject naming the effect, Spec
  trailer, no AI attribution.

## Not applicable

- `agent-os/standards/database/migrations.md` — no schema.
- `agent-os/standards/components/data-grid.md` — the Fix This picker is a dialog list, not
  a DataGrid. The Budget tables already use DataGrid; this spec only changes cell chrome.
- `agent-os/standards/components/drawer-pattern.md` — no drawer.
- `agent-os/standards/components/navigation.md` — no new command.
- `agent-os/standards/development/security.md` — no new mutation.

## Deviations

**None from the standards.** Product look (YNAB scan, Actual math; no new color token) is
recorded in `plan.md` D5.
