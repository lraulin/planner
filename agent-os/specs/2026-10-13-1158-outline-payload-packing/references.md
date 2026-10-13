# References for Outline Payload Packing

## Governing specs

### `agent-os/specs/2026-07-28-1121-main-grid-tabs/`

- **Relationship:** Supersedes one consequence of "One widened `loadOutline`, not a second
  query".
- **Relevant decisions:** One tree query, one `derive`, one `OutlineNode` type, so every tab
  reuses rollups and L.A.P. — all carried forward. What changes is that every page received
  every column of every node as a keyed object. Its rejection of per-tab narrow queries
  ("would drift from `derive` and lose rollups") is the reason slices are cut after
  `derive`, not in SQL.

### `agent-os/specs/2026-08-04-1530-grid-column-parity/`

- **Relationship:** Supersedes the implication of "Load the type-specific values required
  for grids in `loadOutline`".
- **Relevant decisions:** Every faithful field is offered through Show Fields; defaults
  unchanged. Carried forward. It is also why per-grid column trimming buys little.

### `agent-os/specs/2026-07-29-1045-notes-markdown-editor/`

- **Relationship:** Supersedes the Notes page loading the whole outline for the link picker.
- **Relevant decisions:** The picker itself is unchanged; it receives a slice.

### `agent-os/specs/2026-07-27-1100-scaffold-and-outline-tab/`

- **Relationship:** Extends.
- **Relevant decisions:** Shared `nodes` table plus per-type detail tables; adjacency list
  with fractional sort keys; one recursive CTE in depth-first order.

### `agent-os/specs/2026-07-27-1318-per-type-detail-forms/`

- **Relationship:** Extends.
- **Relevant decisions:** The drawer loads one record on open and `loadOutline` does not
  grow for it.

### `agent-os/specs/2026-08-10-1940-daily-use-performance/`

- **Relationship:** Extends.
- **Relevant decisions:** Notes went list-first with detail on demand; "memoize and
  stabilize grid rows before considering virtualization"; layout-wide invalidation kept for
  structural mutations — which is what makes each edit re-ship the page.

### Related, not governing

- `agent-os/specs/2026-10-12-2001-node-postgres-driver/` — same measurement session; about
  round trips, not payload.
- `agent-os/specs/2026-10-13-1155-immediate-navigation-and-page-cache/` — active, shaped the
  same day. Moves the shell into one shared layout (page files move under a route group) and
  caches the Plan pages in memory for 60 seconds. Leaves payload size to this spec.
- Other specs mention `loadOutline` only to add a column to it (task-chooser,
  inbox-quick-capture, task-recurrence, deferred-date-model) or to read it server-side
  (advanced-find, ai-interoperability, weekly-planning-wizard). None is superseded; a column
  added later must also be taught to the codec, which D1.5 enforces at compile time.

## Code studied

### The loader and its types

- **Location:** `src/lib/tree/queries.ts`, `src/lib/tree/types.ts`, `src/lib/tree/derive.ts`
- **Relevance:** `OutlineRow` (48 fields) plus the 15 derived fields of `OutlineNode`.
  Unchanged by this spec; the codec is defined against these types.

### The optimistic layer

- **Location:** `src/components/grid/useOptimisticNodes.ts`,
  `src/components/tabs/useGridTab.ts`
- **Relevance:** Patches are dropped when `initialNodes` changes identity. The unpack must be
  memoised on the payload so identity changes exactly when the server sends new data.

### The action runner

- **Location:** `src/app/actionResult.ts`
- **Relevance:** `run()` revalidates `"/"` at layout scope by default, so each action
  response carries the re-rendered page. Confirmed against
  `node_modules/next/dist/docs/01-app/02-guides/server-actions.md` (Next 16.3.8).

### The drawer

- **Location:** `src/components/detail/NodeDetailDrawerBody.tsx`, `src/lib/detail/queries.ts`
- **Relevance:** Already fetch-on-open. Its optional `nodes` prop only feeds category
  options.

### A slice already done by hand

- **Location:** `src/app/capture/actions.ts` (`listCaptureTargetsAction`)
- **Relevance:** Loads the outline, filters, and maps to `{ id, name, type, depth }` on the
  server. The pattern D3 generalises.
- **Key patterns:** filter after `derive`; send only what the picker draws.

### The pages

- **Location:** `src/app/plan/*/page.tsx`, `src/app/chooser/page.tsx`,
  `src/app/organize/page.tsx`, `src/app/metrics/page.tsx`, `src/app/notes/grid/page.tsx`,
  `src/app/schedule/rangePage.tsx`, `src/app/schedule/week-plan/page.tsx`,
  `src/app/schedule/plan/page.tsx`, `src/app/schedule/time-chart/[chartId]/page.tsx`
- **Relevance:** Every place the outline crosses to the browser. `/organize` sends `nodes`
  and a `queue` subset of the same objects (D5). `/schedule/plan` carries it inside
  `WeeklyPlanPayload` from `src/lib/planning/queries.ts`, which the agent tools also read.

### Measurement tooling

- **Location:** `.agents/skills/run-planner/driver.mjs`, `scripts/smoke.mjs`,
  `scripts/page-routes.mjs`
- **Relevance:** The driver is a dependency-free Chrome DevTools client and can capture
  rendered rows and cells. `smoke` needs the dev server; payload figures need `next start`,
  where the dev login bypass is off.
