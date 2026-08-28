# Standards for A group belongs to a section

Applied as of standards commit `b48a3649baaa98c551b6ee2aac18d0d0166ac322`. References, not
copies — see `AGENTS.md`. `git show b48a3649:agent-os/standards/<path>` recovers exactly what
applied.

- `agent-os/standards/development/clean-code.md` — "when the model is wrong, change the
  model", and its stated signal: a fact recomputed at read time because nothing stores it.
  `groupPageSection` is that fact, `sectionGridRows`' lone-root-header suppression is the
  second workaround, and the empty group is where the recomputation has no answer at all.
- `agent-os/standards/development/testing.md` — `moveDestinations`, `resolveBudgetDrop` and
  `sectionGridRows` are pure and keep their tests beside them; the envelope-kind-matches-group
  rule cannot be a CHECK, so it is a mutation guard and gets an integration test with a second
  user trying to read, change and delete the first user's row.
- `agent-os/standards/components/navigation.md` — why Change section evicts to the section
  root instead of refusing: unavailable is disabled with the reason, and a menu item that
  fails with an explanation the user cannot act on is worse than one that does the obvious
  thing.
- `agent-os/standards/components/data-grid.md` — `sectionGridRows` keeps feeding one shared
  `DataGrid`; the change is which rows it emits, not a new grid affordance.
- `agent-os/standards/development/commits.md` — one logical change per commit; the `Spec`
  trailer points here.

## Deviations

**Shaping and implementation happen in one session.** `AGENTS.md` says shaping ends when the
spec folder is saved. This spec is implemented immediately by the same session that shaped it,
because it was found mid-implementation of
`agent-os/specs/2026-08-28-1527-inline-budget-structure/`, whose drawer deletion is already on
`master`; until this lands, no budget group can be deleted through the UI at all. The context
hygiene the rule protects is not at stake — the shaping context here is one browser session
and one table.
