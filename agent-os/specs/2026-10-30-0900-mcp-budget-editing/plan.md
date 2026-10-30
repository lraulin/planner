# MCP budget editing — Plan

**Status: in review** (2026-10-30)

## Task 1: Save spec documentation

Create this folder with `plan.md`, `shape.md`, `standards.md` and `references.md`.

## Task 2: Mutation options

- `performBudgetOperation(userId, op, { auditOrigin?, exact? })`; `exact` refuses a
  transfer larger than the source's available balance with `BudgetOperationRefused`
  (shape D4).
- `auditOrigin` on `setTransactionBudgetCategories` and on the three split mutations.

## Task 3: Contracts and handlers

- `src/lib/agent/budgetContracts.ts`: strict input and output schemas for the nine tools.
- `src/lib/agent/pageInfoSchema.ts`: `pageInfoSchema` moved out of `contracts.ts` so the
  budget contracts can share it without an import cycle.
- `src/lib/agent/budgetTools.ts`: handlers, `budgetMonthResponse` (pure), and
  `budgetAgentError`, which maps the mutations' plain `Error`s to `not_found`,
  `validation` or `conflict` instead of `internal`.
- `src/lib/agent/tools.ts`: nine `defineTool` entries in the `finances` domain with
  summary / useWhen / avoidWhen / returns / examples for `describe_tool`.

## Task 4: Tests

- `budgetTools.test.ts`: page order, figures, hidden counting, paging, error mapping.
- `defaultResponseBudget.test.ts`: `get_budget_month` under 16 KB for a Lee-sized budget,
  a max page under the gateway cap, and the page-shaped rows over it.
- `budgetTools.integration.test.ts`: every tool against Postgres, the exact-move refusal
  leaving both envelopes unchanged, audit origin, and second-user isolation.
- Inventory lists in `tools.test.ts` and `mcp.test.ts`.

## Task 5: Generated docs

`npm run agent:docs`.
