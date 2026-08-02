# Metric types — Shaping Notes

**Status: frozen / complete** (2026-08-02)

## Scope

Unlock Achieve’s three metric types on the existing Metrics feature:

1. **Instance** — discrete absolute readings (weight, scores, balance).
2. **Cumulative** — contributions that accumulate (pages, dollars, miles).
3. **Total** — absolute “current total” readings (AP default; same display math as
   Instance for this slice).

Type is a **read-time interpretation** of stored entry numbers: switching type does not
rewrite history. Last Value / Current Total and the performance graph respect the type.

### Out of scope

- Auto-target / contribution targets / auto-increase
- Entry types other than `new_total`
- Metric recurrence / On Schedule status
- Graph zoom / print
- Agent tools

## Decisions

- Delta on frozen `2026-08-02-0912-metrics-tab` (column already exists; UI was Total-only).
- Cumulative stores **deltas**; display sum + running-sum chart.
- Instance and Total share latest-value math (AP waist is Type Total with absolute New Total
  entries — Total is not “sum everything”).
- ACHXML integer codes 0/1/2 provisional for total/instance/cumulative.

## Context

- User-provided AP conceptual model (Instance / Cumulative / Total) plus Goals-vs-Projects
  framing for why metrics exist.
- Achieve Tracking form: Type dropdown (screenshot in parent metrics-tab visuals).
- Product: metrics are how Goals track quantitative success vs Projects’ effort/status.

## Standards Applied

- **development/testing** — pure derive tests; no component tests
- **components/drawer-pattern** — Type saved with form draft
- **components/ux-principles** — short helper text, not a tutorial
