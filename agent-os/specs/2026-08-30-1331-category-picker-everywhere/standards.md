# Standards for Category picker on every remaining chooser

Applied as of standards commit `21b01950bacd2f4726bf1166d83a4f0b15217d39`. References, not
copies — see AGENTS.md.

- `agent-os/standards/components/ux-principles.md` — commit on Enter/blur/click, never on
  each keystroke; picking a destination is not a new modal (the dialogs already exist).
- `agent-os/standards/components/data-grid.md` — Supplies Funded from is a grid cell
  editor; the open list must survive the cell’s `overflow-hidden` (already portalled).
- `agent-os/standards/components/modal-pattern.md` — Move money and Assign stay on
  `ModalShell`; expanded combobox already owns the first Escape (`comboboxOwnsEscape`).
- `agent-os/standards/components/drawer-pattern.md` — Payees learned/fixed lives in the
  payee drawer; same Escape guard.
- `agent-os/standards/components/responsive.md` — ≥16px input below `md` (no iOS zoom);
  `min-h-tap` options on compact.
- `agent-os/standards/development/testing.md` — tree, filter, create-off, allowClear, and
  hidden-omit logic in `src/lib/**` with adjacent unit tests; no React component tests.
- `agent-os/standards/development/clean-code.md` — one picker; catalog-as-filter rather
  than a second combobox or a `showHidden` flag; reuse `budgetChildren` / the existing
  Show Hidden predicate, do not invent a second hierarchy.
- `agent-os/standards/development/commits.md` — one logical change; Spec trailer.

## Deviations

None.
