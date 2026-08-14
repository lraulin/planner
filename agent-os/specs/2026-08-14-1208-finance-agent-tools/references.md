# References for Finance agent tools

## Governing specs

### `agent-os/specs/2026-08-09-1130-agent-tool-contracts/`

- **Relationship:** Extends.
- **Relevant decisions:** Canonical Zod registry, strict schemas,
  `dispatchAgentTool`, focused HTTP discovery, one write path.

### `agent-os/specs/2026-08-13-1730-remote-mcp-transport/`

- **Relationship:** Extends. New tools appear on `tools/list` automatically
  once registered with `exposure: "domain"`.
- **Relevant decisions:** Thin wrapper over `dispatchAgentTool`; catalog is
  core + domain minus HTTP discovery and legacy aliases.

### `agent-os/specs/2026-08-13-1805-mcp-oauth/`

- **Relationship:** Extends. Auth is unchanged.
- **Relevant decisions:** Same Bearer / OAuth gate; no new identity.

### `agent-os/specs/2026-08-12-2031-finances-insights-dashboard/`

- **Relationship:** Extends. The dashboard is the source of truth for every
  number these tools return.
- **Relevant decisions:** Integer cents; `analytics.ts` owns flow/category
  rules; trailing average over full history then slice to the window;
  declared bills read amounts from the whole history.

## Similar implementations

### Metric tools

- **Location:** `src/lib/agent/metricTools.ts`, `contracts.ts` (`list_metrics`
  / `get_metric`), `tools.ts` registry entries
- **Relevance:** Handler shape — parse helpers, `userId` first, `AgentError`,
  pagination, no SQL in the tool file.
- **Key patterns:** One exported function per tool; compact list rows;
  `pageInfo` from `agent/pagination.ts`.

### Insights composition

- **Location:** `src/components/finances/insights/InsightsView.tsx` `useMemo`
- **Relevance:** The exact composition `analyzeInsights` must preserve.
- **Key patterns:** Filter first; `cashFlow` over full buckets then slice;
  `recurringMerchants(windowed, bills, filtered)`; coverage on unfiltered
  rows.

### Dashboard queries

- **Location:** `src/lib/finances/dashboardQueries.ts`
- **Relevance:** The one read the tools share with the page
  (`loadInsightsRows`, `loadRecurringBills`, `loadCarryingCost`,
  `unclassifiedCount`).
- **Key patterns:** `userId` on every query; no SQL aggregation of
  dashboard figures.
