# Finance agent tools — Shaping Notes

**Status: frozen / complete** (2026-08-14)

## Scope

Give the MCP / agent API a read-only Finances surface so an agent can answer
cash-flow questions from the same numbers the Insights dashboard shows.

Six tools: overview, cash flow, spending breakdown, recurring bills, debt /
carrying cost, and transaction search.

### Out of scope

- Classification writes (`exclude_from_baseline`, category/flow overrides,
  declaring a recurring bill)
- Sankey layout and cadence _candidates_ (UI affordances, not analysis)
- Budgets / envelopes (still deferred on the roadmap)
- New MCP transport, OAuth, or contract version bump
- Formatted dollar strings alongside cents

## Decisions

- Read-only. The agent advises; the human classifies in the UI.
- Extract `analyzeInsights()` into `src/lib/finances/` rather than composing
  analytics a second time in the tool handlers. The agent and the page must
  never disagree.
- Money is integer cents. Field names end in `Cents`.
- Search and filter run in JS over `loadInsightsRows` using `effective*`
  helpers, not restated SQL.
- Axis values match the dashboard (`month` | `pay-period`). `pay_period` is
  accepted as an alias so snake_case callers do not fail.
- `search_transactions` is the permitted general-purpose escape hatch (more
  than ~8 parameters) because splitting it would lose the whole-match
  aggregates that make "did the gifts cover the gap" one call.

## Context

- **Visuals:** None
- **References:** Agent tool contracts, remote MCP transport, finances
  insights dashboard, `metricTools.ts` as the handler pattern, `InsightsView`
  `useMemo` as the composition to extract
- **Product alignment:** Roadmap § Financial planning — "AI advice on top of
  envelope + history data" is later; this ships the history read the advice
  would stand on. The motivating question is cash-flow analysis, not envelopes.

## Standards Applied

- api/agent-tools — one registry, descriptions as selection instructions,
  compact outputs, focused exposure
- api/response-format — `{ ok, data }` on `/api/agent/{tool}`; tool output
  schemas describe the value under `data`
- api/error-handling — same codes; missing/foreign ids look like `not_found`
- development/clean-code — real logic in `src/lib/**`
- development/testing — unit tests beside pure modules; integration tests
  with a second-user case
- development/security — `userId` on every query; do not leak foreign rows
