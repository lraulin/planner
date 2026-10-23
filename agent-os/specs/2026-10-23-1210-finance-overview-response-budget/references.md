# References for get_finance_overview fits the response budget with real history

**Status: active**

## Governing specs

### `agent-os/specs/2026-08-14-1208-finance-agent-tools/`

- **Relationship:** Extends — `get_finance_overview`.

### `agent-os/specs/2026-08-09-1130-agent-tool-contracts/`

- **Relationship:** Extends — output schemas and the response budget.

## Code

- `src/lib/agent/financeTools.ts` — `financeOverviewResponse`, `OVERVIEW_HOLE_LIMIT`,
  `OVERVIEW_OTHER_CATEGORY_LIMIT`.
- `src/lib/agent/contracts.ts` — overview output schema.
- `src/lib/agent/defaultResponseBudget.test.ts` — budget tests.
- PR #27 — the earlier trim (merchants out, working balances in).
