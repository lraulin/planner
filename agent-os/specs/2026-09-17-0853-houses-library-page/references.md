# References for Houses

## Governing specs

This is a root spec — no prior spec's decisions are extended or superseded. It draws on
several as reference implementations rather than as governing decisions:

### `agent-os/specs/2026-08-13-0747-module-pages/`

- **Relationship:** Reference — established the Module → Page → View tier that Houses fits
  into as a `PageEntry`.
- **Relevant decisions:** A page bar needs ≥2 built pages (Library already has 5); a page is
  `{ id, label, segment, status, isDefault?, keywords? }` in `src/lib/navigation/pages.ts`.

### `agent-os/specs/2026-08-04-0924-grid-control-surface/`

- **Relationship:** Reference — the authoritative control-surface spec for `DataGrid`.
- **Relevant decisions:** A section declares what it has (columns, `allColumns`); the grid
  supplies how you control it (search, filter, sort, group, density) for free. No new grid
  runtime dependency.

### `agent-os/specs/2026-08-19-0912-always-ranked-priorities/`

- **Relationship:** Reference — the authoritative priority model.
- **Relevant decisions:** A node is either unprioritized (letter and rank both null) or ranked
  (letter + dense rank ≥ 1). Houses reuses `priorityLetter`/`priorityRank` + the shared
  `letterRankEngine` unchanged.

### `agent-os/specs/2026-08-09-1130-agent-tool-contracts/`

- **Relationship:** Reference — the MCP tool registry pattern (contracts + registry + handler
  triple, `dispatchAgentTool`, strict schemas).

### `agent-os/specs/2026-08-18-1444-history-agent-tools/`

- **Relationship:** Reference / template — the closest precedent for adding a whole new tool
  domain (residences' `list_residences`/`get_residence`/`create_residence`/`update_residence`).
  Its `plan.md` Task list is the template for Task 7 here. Houses adds a `delete_house` tool
  that residences did not need.

### `agent-os/specs/2026-08-14-1208-finance-agent-tools/`

- **Relationship:** Reference — second precedent confirming new domains are additive and do
  not bump `AGENT_CONTRACT_VERSION`.

## Similar implementations

### Jobs (`/library/jobs`)

- **Location:** `src/lib/jobs/`, `src/components/jobs/`, `src/app/library/jobs/`
- **Relevance:** Closest full end-to-end precedent for a Library page with a fully read-only
  grid (all edits in the drawer) and a keyed-retry create (`createJobOnce`).
- **Key patterns to borrow:** `JobsView.tsx` view-wiring skeleton; `actions.ts` thin
  `run`/`runQuery` wrappers; `mutations.integration.test.ts` cross-user shape.

### Resources (`/library/resources`)

- **Location:** `src/lib/resources/`, `src/components/resources/`, `src/app/library/resources/`
- **Relevance:** Smaller sibling of the same pattern; `ResourcesView.tsx` is the direct copy
  target for `HousesView.tsx`. Comment "a small maintained catalog rather than a second
  schedule surface" matches Houses' own scope.

### Metrics (`src/db/schema.ts` `metrics` table)

- **Location:** `src/db/schema.ts:1667`, `src/lib/metrics/`
- **Relevance:** Precedent for a flat catalog table carrying `priorityLetter`/`priorityRank`,
  a `sortKey` fractional index, and the `externalSource`/`externalId` retry-key pair together.

### External-service-derived value, cached with fail-soft semantics

- **Location:** `src/lib/url/pageTitle.ts`
- **Relevance:** The repo's existing pattern for "call an external service, cap the timeout
  and response size, and let the row save even if the call fails" — directly reused for
  geocoding/routing.

### Thin impure HTTP client + pure logic module split

- **Location:** `src/lib/banksync/client.ts` (impure, untested) + `src/lib/banksync/mapping.ts`
  (pure, tested)
- **Relevance:** Template for `src/lib/houses/geo.ts` (impure Nominatim/OSRM client) +
  `src/lib/houses/route.ts` (pure parsing/formatting/staleness logic, tested).

### Per-user vs. app-wide secret placement

- **Location:** `src/db/schema.ts` `bank_connections.access_url` comment (~line 3222)
- **Relevance:** Not directly needed here — Nominatim/OSRM require no API key — but confirms
  the rule that would apply if a paid geocoder were substituted later: an app-wide key belongs
  in the environment, a per-user credential belongs in the database.
