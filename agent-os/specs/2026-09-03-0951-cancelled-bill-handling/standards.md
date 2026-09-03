# Standards for Cancelled bill handling

Applied as of standards commit `7c716173ffbf08c8490284aba3e515ce88178034`. References, not
copies — see AGENTS.md.

- `agent-os/standards/development/testing.md` — visibility, next-due skip, and inspector
  warning live in `src/lib/**` with adjacent unit tests that would fail if a quiet cancelled
  bill stayed on the grid or if cancelled still grew a next-charge date; no React component
  tests.
- `agent-os/standards/development/clean-code.md` — the predicate belongs in
  `src/lib/finances/budget/`, not `BudgetView`; `nestedBudgetGridRows` is the existing
  visibility gate — extend it rather than inventing a second filter in the view.
- `agent-os/standards/development/dates.md` — visibility is the viewed month’s Assigned /
  Activity / Available, not `cancelledOn` vs today; next-due keys stay calendar-day strings.
- `agent-os/standards/components/ux-principles.md` — warning lives in the inspector; no
  extra modal; Hide envelope is not the cancelled path.
- `agent-os/standards/components/data-grid.md` — Show Hidden is the existing switch; extend
  its meaning to quiet cancelled bills rather than adding a second switch or renaming it.

## Deviations

None.
