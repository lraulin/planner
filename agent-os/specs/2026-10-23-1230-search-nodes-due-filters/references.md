# References for search_nodes: due-date filters, deadline sort, compact rows

**Status: active**

## Governing specs

### `agent-os/specs/2026-08-09-1130-agent-tool-contracts/`

- **Relationship:** Extends — `search_nodes` contract, paging, response budget.

## Code

- `src/lib/agent/search.ts` — `filterOutlinePage`, `fitPageToBudget`,
  `SEARCH_NODES_BYTE_BUDGET`.
- `src/lib/agent/serialize.ts` — `compactNodeSummary`.
- `src/lib/agent/outlineTools.ts` — `searchNodes`.
- `src/lib/agent/contracts.ts`, `src/lib/agent/tools.ts` — schema and tool text.
- `src/lib/schedule/readerZone.ts` — `readerTodayKey`.
- `src/lib/agent/search.test.ts`, `src/lib/agent/defaultResponseBudget.test.ts`.
