# References for History agent tools

## Governing specs

### `agent-os/specs/2026-08-13-2006-life-history/`

- **Relationship:** Extends.
- **Relevant decisions:** Field sets for jobs, residences, and typed events;
  exact `YYYY-MM-DD` dates; money as numeric strings; duration computed on the
  client; open vocabularies; derived chronology rows are read-time only.

### `agent-os/specs/2026-08-09-1130-agent-tool-contracts/`

- **Relationship:** Extends.
- **Relevant decisions:** Canonical Zod registry, strict schemas,
  `dispatchAgentTool`, focused HTTP discovery, one write path,
  `retryableObject` + `create*Once`.

### `agent-os/specs/2026-08-13-1730-remote-mcp-transport/`

- **Relationship:** Extends. New tools appear on `tools/list` automatically
  once registered with `exposure: "domain"`.
- **Relevant decisions:** Thin wrapper over `dispatchAgentTool`; catalog is
  core + domain minus HTTP discovery and legacy aliases.

### `agent-os/specs/2026-08-13-1805-mcp-oauth/`

- **Relationship:** Extends. Auth is unchanged.

### `agent-os/specs/2026-08-14-1208-finance-agent-tools/`

- **Relationship:** Extends. Pattern for adding a domain, not the finance
  numbers themselves.
- **Relevant decisions:** `domain` enum, `exposure: "domain"`, handlers in a
  dedicated `*Tools.ts`, no contract version bump.

## Similar implementations

### Metric tools

- **Location:** `src/lib/agent/metricTools.ts`, `contracts.ts`
  (`list_metrics` / `get_metric` / `create_metric`), `tools.ts` registry
- **Relevance:** Closest CRUD pattern for a standalone catalog.
- **Key patterns:** Compact list + full get; `pageInfo`; `createMetricOnce`;
  `created: boolean` on create.

### Job / residence / event mutations

- **Location:** `src/lib/jobs/mutations.ts`, `src/lib/residences/mutations.ts`,
  `src/lib/timeline/mutations.ts`
- **Relevance:** The one write path. Tools must not reimplement SQL.
- **Key patterns:** `userId` first; `patchText` + `dateKeyOrNull` +
  `moneyOrNull` + `requireOrderedDates`; “not found” throws.

### Shared history fields

- **Location:** `src/lib/history/fields.ts`
- **Relevance:** Date-order and money validation already exist; the tools map
  those messages to `validation`.
