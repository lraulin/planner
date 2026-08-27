# Standards for Split transactions

Applied as of standards commit `b8ecaf5a`. References, not copies — see AGENTS.md.
`git show b8ecaf5a:agent-os/standards/<path>` recovers exactly what applied at shape time.

- `agent-os/standards/database/migrations.md` — three columns, a CHECK and a partial index on
  `finance_transactions`. Generated with drizzle-kit and never hand-written without its
  snapshot; the direct connection, not the pooler.
- `agent-os/standards/development/testing.md` — the load-bearing one here. The remainder
  allocator is pure logic and goes in `src/lib/finances/splitRemainder.ts` with a test beside
  it; the split mutations touch the database and need `*.integration.test.ts` with a second
  user failing to read, change and delete the first user's rows. The novel cross-user hole is
  attaching a child to another user's parent, and it is named as its own criterion because a
  `userId` check on the child insert alone would not catch it.
- `agent-os/standards/development/clean-code.md` — "When the model is wrong, change the model"
  is the justification for this spec existing at all (two workarounds, one missing concept).
  Also the app→components→lib→db direction: the allocator is pure and knows nothing about
  Drizzle or React, and every mutation takes `userId`.
- `agent-os/standards/development/security.md` — every new mutation proves ownership of the
  parent before writing a child. `on delete cascade` from parent to child means a delete path
  that skipped the ownership check would destroy rows, not just leak them.
- `agent-os/standards/components/data-grid.md` — the Register rides the shared DataGrid.
  Relevant here: hierarchy has to survive sort and filter, which D8 satisfies by keeping
  children out of both rather than by making them sortable; and the split/unsplit verbs need
  menu entries, since a command without a menu is not shipped.
- `agent-os/standards/components/drawer-pattern.md` — the split editor lives in
  `TransactionDrawer`: Cancel | Save | Save & Close, sticky footer, unsaved-changes on leave.
- `agent-os/standards/components/ux-principles.md` — decimal commit on blur for the child
  amount fields, and no re-sort while editing.
- `agent-os/standards/development/commits.md` — one logical change per commit; the schema, the
  allocator, the mutations and the reader audit are separate commits, and the audit's commit
  body says which filter each call site got and why.

## Deviations

- **`agent-os/standards/components/responsive.md` — not applied for v1.** Split editing is
  desktop-only (D12); mobile renders splits read-only. Splitting is a deliberate, fiddly
  operation done while reading a receipt, and the standing position is that desktop-only
  features are acceptable rather than chasing parity. The read-only mobile rendering still
  respects the standard's list-and-sheet layout.
- **Divergence from Actual Budget on two points**, recorded in `plan.md` D1, D6 and D7 rather
  than here, since `docs/actual-budget/README.md` is the map for those: no `is_child` column,
  strict balance instead of a tolerated `SplitTransactionError`, and a proportional `Distribute`
  where Actual's is even-across-empty-children.
