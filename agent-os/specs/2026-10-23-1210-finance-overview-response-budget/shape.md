# get_finance_overview fits the response budget with real history — Shaping Notes

**Status: active**

## Scope

### In scope

- Order, bounds and the `otherCategories` rename (D1–D4).

### Out of scope

- A dedicated category-list tool; `otherCategoryCount` tells an agent when the list is cut.
- Measuring production output. The Planner MCP connector was not authorised in this session;
  the fixture is the stand-in.

## Context

- `financeOverviewResponse` (`src/lib/agent/financeTools.ts`) is pure; the budget test in
  `src/lib/agent/defaultResponseBudget.test.ts` calls it directly.
- Zod output parsing reorders keys to schema order, so the order is fixed in
  `src/lib/agent/contracts.ts`, not just in the builder.
