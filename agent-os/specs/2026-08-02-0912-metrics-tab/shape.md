# Metrics Tab + Import/Export — Shaping Notes

**Status: frozen / complete** (2026-08-02)

## Scope

Complete **core metrics** functionality for Achieve parity at MVP depth:

1. **First-class metrics domain** — `metrics` + `metric_entries` (not thin `node_items`).
2. **Metrics tab** — view **all** metrics (standalone or goal-owned); create without a goal;
   Group by Owner; performance graph for the selected row.
3. **Metric form** — General + Tracking (basics): active, type Total, question, units,
   objective target, tracking-values grid; CSV export of entries.
4. **Goal form** — Metrics section uses the same tables (associate with goal on create).
5. **Import/export** — ACHXML `Metrics` + `MetricTracking` tables.

### Out of scope

- Auto-target / Recompute Targets
- Day-of-week contribution targets and auto-increase
- Metric recurrence + reminders (and Status On Schedule / Overdue)
- Graph zoom, scale persistence, Print
- Agent API tools
- Other Tier B (Contacts, Labels)
- Fitness bodyweight as metrics (separate domain)

## Decisions

- **Core MVP depth** — list tab, form, tracking history, graph, CSV, import/export; defer
  advanced tracking machinery and recurrence.
- **First-class tables** with optional `ownerNodeId` (`ON DELETE SET NULL`) so metrics can
  exist without a goal and history survives goal delete.
- **Same store for Goal form and Metrics tab** — no dual write to `node_items` kind `metric`
  after migration.
- **Inline SVG graph** — no new chart dependency.
- **Status column deferred** — needs recurrence; show Last Value instead.
- **Phase 2 product framing** — Achieve surface + own-your-data import/export.

## Context

- **Visuals:** `screenshots/metrics/` (5 Achieve screenshots — list + graph, form General,
  form Tracking, goal Metrics list, Group by Owner). Copied into `visuals/`.
- **References:** Wish List tab (cross-owner grid), Notes (optional owner + set null),
  Fitness (durable domain + own tab), GoalForm/itemKinds, achieve mapExtras/import/export.
- **Product alignment:** Phase 2 near-term Achieve surface; Tier B Metrics/MetricTracking
  on import roadmap; mission “own your data” for export.

## Standards Applied

- **development/testing** — pure logic + DB mutations; cross-user isolation; no component tests
- **database/migrations** — generate with snapshot; data backfill for old node_items metrics
- **components/ux-principles** — grid + drawer, keyboard, progressive disclosure
- **components/drawer-pattern** — metric detail form
- **components/modal-pattern** — destructive confirms if needed
- **components/responsive** — list + sheet on phone
- **api/response-format** — if achieve import/export HTTP routes change response shape
