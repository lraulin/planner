# References for Metrics Tab + Import/Export

## Achieve UI (source of truth for product shape)

### Metrics screenshots

- **Location:** `screenshots/metrics/` (also `visuals/` in this spec)
- **Relevance:** Tracking/Metrics list + performance graph; Metric Information General /
  Tracking; Goal form Metrics list; Group by Owner.
- **Key patterns:** Split list/graph; Owner optional; tracking grid Date/Type/Target/Value;
  CSV Export on form; Active + Priority + Last Value columns.

### User manual / file formats

- `docs/achieve-planner/user-manual.md` — Metrics tab = standalone or part of dream/goal
- `docs/achieve-planner/file-formats.md` — Tier B: Metrics + MetricTracking
- `docs/achieve-planner/release-log.txt` — auto-target, graph zoom, CSV export, Last Date, Status, etc.
  (many deferred for MVP)

## Similar implementations in this codebase

### Wish List tab

- **Location:** `src/app/wishes/page.tsx`, `src/lib/detail/wishQueries.ts`,
  `src/components/tabs/WishesGrid.tsx`
- **Relevance:** Cross-node list of `node_items` with owner resolution and DataGrid tab.
- **Key patterns:** `loadWishList` joins owner; tab in `tabs.ts`; Group/filter controls.

### Notes (optional owner, durable)

- **Location:** `src/db/schema.ts` `notes` table; `src/app/notes/`; notes import in
  `src/lib/achieve/`
- **Relevance:** `nodeId` nullable, `ON DELETE SET NULL` — same ownership durability for
  metric → goal.
- **Key patterns:** Separate domain table; tab + drawer; import as extras.

### Fitness strength log

- **Location:** `agent-os/specs/2026-07-30-1240-fitness-strength-log/`, `src/app/fitness/`,
  `src/db/schema.ts` exercises/sessions
- **Relevance:** Explicit anti-pattern note: goal metrics cascade is wrong for durable
  multi-entry history. Own tables + own tab.
- **Key patterns:** Domain lib under `src/lib/fitness/`; never cascade from outline nodes.

### Goal form child lists

- **Location:** `src/components/detail/GoalForm.tsx`, `src/components/detail/itemKinds.ts`
- **Relevance:** Current thin Metrics list (`list("metric")`); replace with first-class
  metrics list for the goal.
- **Key patterns:** Form section tabs; itemKinds field config (retire for metric writes).

### Achieve import/export extras

- **Location:** `src/lib/achieve/mapExtras.ts`, `import.ts`, `exportXml.ts`, `exportLoad.ts`
- **Relevance:** Pattern for non-outline tables (appointments, wishes, notes). Metrics join
  this pass.
- **Key patterns:** `EXTRAS_TABLES`, `KNOWN_SKIP`, merge/replace wipe sets, external GUIDs.

### Main grid tabs

- **Location:** `agent-os/specs/2026-07-28-1121-main-grid-tabs/`, `src/components/grid/`,
  `src/components/tabs/`
- **Relevance:** Shared DataGrid, grouping, filters for the Metrics list.

## Frozen specs that constrain design

- Fitness log — metrics must not be the training-history store (already separate).
- Notes — optional link + set null on parent delete.
- Multi-user accounts — every mutation scopes by `userId`.
