# Category picker by kind — Shaping Notes

**Status: active**

## Scope

- Group the Register Category dropdown by envelope kind.
- Add New {type}… in each group, with New bill… sharing the Track as bill write.
- File claimed payee charges (including history) and write a payee-is rule.
- Allow categorising transactions before the budget start month.
- Feed Average Spent / Spent Last Month from that history.

### Out of scope

- Folding pre-start months into Ready to Assign.
- Reordering seeded rules by regex specificity.
- Destroying leftover taxonomy columns.
- Creating bills from BudgetStructureDrawer without a cadence.
- Shadow "user vs rule" category columns.

## Decisions

- Track as bill, New bill…, Review, and Insights share `trackTransactionAsBill` (isolate payee from the row, then the canonical envelope write). The agent tool and payee-claim picker still call `upsertBillEnvelope` / `replaceCommitmentPayees` → `applyClaimedPayees` with a known payee. Confirmed in review: DRY filing, one browser action for the transaction-backed path.
- Filing a bill's payee includes historical on-budget charges; other CVS payees stay unclaimed.
- Average Spent / Spent Last Month look at categorised spend before the start month. Average Assigned does not invent Assigned before start.

## Context

- **Visuals:** None. Assign's To picker already uses `<optgroup>` by section.
- **References:** See `references.md`.
- **Product alignment:** Envelope budget analysis and the first month's auto-assign, without moving the start date.

## Standards Applied

See `standards.md`.
