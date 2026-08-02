# References for Metric types

## Frozen parent

- **`agent-os/specs/2026-08-02-0912-metrics-tab/`** — first-class metrics + entries; MVP
  Type locked to Total; `metricType` column reserved for later.

## Code

- `src/lib/metrics/types.ts`, `derive.ts`, `queries.ts`, `mutations.ts`
- `src/components/metrics/MetricDrawer.tsx` — Tracking Type field (was read-only Total)
- `src/components/metrics/MetricChart.tsx` — `chartPoints` consumer
- `src/lib/achieve/mapExtras.ts` — `decodeMetricType`
- `src/lib/achieve/exportXml.ts` — Metrics `Type` encode

## Achieve UI

- Tracking form Type dropdown: parent visuals
  `../2026-08-02-0912-metrics-tab/visuals/Screenshot 2026-08-02 at 8.56.54 AM.png`
  (Type: Total; Current Total; New Total entry type)

## Conceptual source

- User note on Instance / Cumulative / Total storage vs display vs aggregation
- Goals use metrics for success; Projects use Effort Left + Status
