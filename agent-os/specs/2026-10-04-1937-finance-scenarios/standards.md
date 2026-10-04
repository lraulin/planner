# Standards for Scenarios

Applied as of standards commit `866bae77`. References, not copies — see AGENTS.md.
`git show 866bae77:agent-os/standards/<path>` recovers what applied.

- `agent-os/standards/components/data-grid.md` — the worksheet is a tree in the shared
  `DataGrid`: hierarchy that survives sort and filter, drag-to-reorder for lines,
  aggregation in the columns being totalled, preferences through `useGridState`.
- `agent-os/standards/components/navigation.md` — one page-registry entry; every scenario
  and line command lives in a menu, and an unavailable one is disabled with its reason.
- `agent-os/standards/components/ux-principles.md` — inline editing, money committed on
  blur, no re-sort while editing, modals only for the pickers and confirmations.
- `agent-os/standards/components/modal-pattern.md` — Add from Supplies and the delete
  confirmations are built on `ModalShell`.
- `agent-os/standards/components/responsive.md` — the phone layout is a list with totals.
- `agent-os/standards/database/migrations.md` — Task 2 is a data-transforming migration
  (add, backfill, drop) and takes the recovery gate before deploy; Task 3 is additive.
- `agent-os/standards/development/testing.md` — the arithmetic lives in `src/lib` with
  unit tests; every query and mutation gets an integration test with a second user.
- `agent-os/standards/development/security.md` — a line references four other tables by
  id, and each id is proven to belong to the caller before the write.
- `agent-os/standards/development/clean-code.md` — "when the model is wrong, change the
  model" is the basis for D6; "one shared implementation per concern" is the basis for
  reusing `annualCents`, `billRows` and the Insights spending rules.
- `agent-os/standards/api/agent-tools.md` — the two read tools are registry-defined with
  strict schemas, and a foreign id is indistinguishable from a missing one.

## Deviations

None.
