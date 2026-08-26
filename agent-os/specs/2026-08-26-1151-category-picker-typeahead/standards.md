# Standards for Category picker typeahead

**Status: frozen / complete** (2026-08-26)

Applied as of standards commit `b8ecaf5a8f68b7e19b0b943e3ec4c693f042832c`. References, not
copies — see AGENTS.md.

- `agent-os/standards/components/ux-principles.md` — inline Category edit; commit on
  Enter/blur/click, never on each keystroke; routine filing is not a new modal.
- `agent-os/standards/components/data-grid.md` — Category is a grid cell editor; the open
  list must survive the cell’s `overflow-hidden`.
- `agent-os/standards/components/modal-pattern.md` — Set category… stays on ModalShell and
  hosts the same picker.
- `agent-os/standards/components/responsive.md` — ≥16px input below `md` (no iOS zoom);
  `min-h-tap` options on compact.
- `agent-os/standards/development/testing.md` — tree + filter logic in `src/lib/**` with
  adjacent unit tests; no React component tests.
- `agent-os/standards/development/clean-code.md` — one picker; reuse `budgetChildren` for
  sibling order; do not invent a second hierarchy.
- `agent-os/standards/development/commits.md` — one logical change; Spec trailer.

## Deviations

None.
