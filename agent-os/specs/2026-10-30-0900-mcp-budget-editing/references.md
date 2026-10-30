# References for MCP budget editing

## Governing specs

### `agent-os/specs/2026-08-09-1130-agent-tool-contracts/`

- **Relationship:** Extends.
- **Relevant decisions:** one Zod registry, strict schemas, `{ ok, data }` envelope,
  validation errors from schema failures, effects and retry advertising.

### `agent-os/specs/2026-08-14-1208-finance-agent-tools/`

- **Relationship:** Extends.
- **Relevant decisions:** finance tools in the `finances` domain, cents integers, compact
  list rows.

### `agent-os/specs/2026-10-23-1210-finance-overview-response-budget/`

- **Relationship:** Follows.
- **Relevant decisions:** 16 KB default response budget and the 20,000-byte gateway cap,
  tested with a fixture sized to Lee's real data.

### `agent-os/specs/2026-08-22-1948-zero-based-budget/`, `2026-08-24-2206-single-pool-budget/`, `2026-09-14-1004-ledger-ready-to-assign/`

- **Relationship:** Uses unchanged.
- **Relevant decisions:** the month fold, Ready to Assign, assign and transfer as the
  only allocation writes.

### `agent-os/specs/2026-08-24-0930-envelope-sections/`, `2026-08-23-1807-nested-budget-groups-bill-import/`, `2026-08-28-1527-inline-budget-structure/`

- **Relationship:** Uses unchanged.
- **Relevant decisions:** envelope kinds, an envelope's kind equals its group's, nested
  groups, section-root envelopes, a kind change moving to the new section's root.

### `agent-os/specs/2026-08-26-2022-split-transactions/`

- **Relationship:** Uses unchanged.
- **Relevant decisions:** children sum to the parent, an empty set unsplits, the parent
  gives up its envelope.

### `agent-os/specs/2026-08-29-0845-bank-snapshots-finance-audit/`

- **Relationship:** Extends (audit origin "Agent").

### `agent-os/specs/2026-10-01-1040-mcp-transaction-delete-and-payee-aliases/`

- **Relationship:** Sibling. Same handler and integration-test pattern.

## Code

- `src/lib/finances/budget/mutations.ts` — `performBudgetOperation`, structure writes.
- `src/lib/finances/budget/queries.ts` — `loadBudget`.
- `src/lib/finances/budget/rows.ts` — `budgetRows`, `sectionGridRows`.
- `src/lib/finances/mutations.ts` — `setTransactionBudgetCategories`, split mutations.
- `src/lib/agent/ledgerTools.ts` — the closest existing agent handler module.
