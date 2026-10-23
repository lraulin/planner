# get_finance_overview fits the response budget with real history

**Status: active**
Spec folder: `agent-os/specs/2026-10-23-1210-finance-overview-response-budget/`

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-14-1208-finance-agent-tools/` (`get_finance_overview`).
- **Extends:** `agent-os/specs/2026-08-09-1130-agent-tool-contracts/` (strict output schemas,
  response budget).

## Context

PR #27 (merged 2026-10-09) dropped merchants from `get_finance_overview` and measured it at
~13.9 KB — against a fixture with no statements and no legacy categories. Planner Bot still
sees ~29 KB on Lee's data, with envelopes first. Two lists grow with history and were unbounded:

- `coverage.holes` — one entry per missing statement month per account, for all time.
- `categories` — every distinct effective category, including envelope names (already listed
  in `envelopes`) and years of imported legacy names.

Envelopes also came first, so a client that truncates at the gateway cap (20 KB) cut off the
accounts and history an agent opens the tool for.

## Decisions

### D1: Key order — accounts first

`accounts, history, unclassifiedCount, carryingCost, coverage, groups, envelopes,
otherCategoryCount, otherCategories, merchantCount, merchantsTool`.

### D2: Bounded holes

`coverage.holes` keeps the newest 10 (by `beforePeriodStart`, descending) and adds
`holeCount` and `holesTool: "list_statements"` for the rest.

### D3: `categories` → `otherCategories`

Only effective categories that are not envelope names, first 40, plus `otherCategoryCount`.
Breaking rename: a caller reading `categories` must switch.

### D4: Slim envelopes

`incomeRole` and `expectedMonthlyIncomeCents` appear only on income envelopes.

## Acceptance

- [x] Under 16 KB (`BUDGET_BYTES`) on a fixture with five accounts × 80 statements with holes and
      180 legacy categories, which exceeds the 20 KB gateway cap with the old unbounded lists.
- [x] First key is `accounts`, before and after the output schema parse.
- [x] Holes listed newest first; counts report the full totals.
- [x] `docs/agent-api.md` regenerated.

## Tasks

1. Save spec documentation (this folder).
2. Reorder and bound `financeOverviewResponse`; contract and tool text.
3. Response-budget tests with a history-heavy fixture.

## Changes from original plan

| What | Why |
| ---- | --- |
