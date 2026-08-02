# Metric types (Instance / Cumulative / Total)

**Status: frozen / complete** (2026-08-02)  
Spec folder: `agent-os/specs/2026-08-02-1336-metric-types/`  
Delta on frozen: `agent-os/specs/2026-08-02-0912-metrics-tab/`

## Context

The Metrics MVP shipped with `metricType` on the row (default `"total"`) but the Tracking
tab Type control is **read-only Total**. Achieve’s Type dropdown has three values that
control how entered values are **interpreted for Last Value / Current Total and the
performance graph**. Official AP docs are sparse; this slice encodes the intended
semantics so goal metrics can track both snapshots and progressive sums.

**Product framing (Goals vs Projects):** Metrics differentiate Goals from Projects.
Projects use Effort Left + Status; Goals use metrics for perceived and quantitative
success — not just task completion. That is why metric type is more than a label: it
changes what “progress” means for a goal.

## Decisions

| Decision       | Choice                                                                                                                                              | Why                                                                                                                                            |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Types          | **`instance` \| `cumulative` \| `total`** (string codes, already free-text column)                                                                  | Match AP; no migration needed                                                                                                                  |
| Default        | Keep **`total`**                                                                                                                                    | Matches MVP + ACHXML `Type=0`                                                                                                                  |
| **Instance**   | Each entry is a discrete absolute reading. Last Value / Current = **latest by date**. Chart = raw values in date order.                             | Snapshots: weight, mood, bank balance, BP                                                                                                      |
| **Total**      | Same **display math as Instance** for this slice. Value entered **is** the total/measurement (AP “New Total” style).                                | AP body metrics use Type Total with absolute readings; “grand total” framing without different aggregation until contribution machinery exists |
| **Cumulative** | Each entry is a **contribution (delta)**. Last Value / Current = **sum of all entry values**. Chart = **running sum** in date order.                | Pages written, dollars saved, miles run — progressive progress toward a target                                                                 |
| Storage        | Entries always store the **number the user typed** — never rewrite history on type change                                                           | Type is a **read-time interpretation** of the series                                                                                           |
| Entry types    | Leave entry `entryType` as today (`new_total`); no new Contribution entry type                                                                      | Out of scope; auto-target / contribution targets still deferred                                                                                |
| UI             | Tracking tab Type becomes a **select**; save with metric                                                                                            | Replace read-only “Total”                                                                                                                      |
| ACHXML         | Decode/encode `0`/`total` → total; `1`/`instance` → instance; `2`/`cumulative` → cumulative (provisional ints until a multi-type dump is inspected) | Import must not drop non-total metrics                                                                                                         |
| Out of scope   | Auto-target, day contribution targets, auto-increase, metric recurrence/Status, graph zoom, agent tools                                             | Already deferred on frozen metrics spec                                                                                                        |

### Operational matrix

| Type           | Stored entry value       | Last Value / Current Total           | Chart series                  |
| -------------- | ------------------------ | ------------------------------------ | ----------------------------- |
| **instance**   | Absolute reading         | Latest by `entryDate` (id tie-break) | Raw values chronological      |
| **total**      | Absolute total           | Same as instance                     | Same as instance              |
| **cumulative** | Contribution / increment | Σ all entry values                   | Running sum of values by date |

Changing type only changes derived display; existing entry numbers stay put.

## Acceptance criteria

- [x] Type select on Metric form Tracking: Instance / Cumulative / Total (default Total)
- [x] Create/update persist `metricType`; list + detail return it
- [x] `lastValue` (list, detail, “Current total” label) follows the matrix above
- [x] Performance graph series follows the matrix (cumulative = running sum)
- [x] Pure unit tests for derive helpers (instance/total latest vs cumulative sum/running)
- [x] ACHXML import maps known Type codes; export round-trips all three
- [x] No schema migration required
- [x] Spec frozen; roadmap Metrics bullet notes metric types

## Changes from original plan

| #   | Change                                                     | Why                                              |
| --- | ---------------------------------------------------------- | ------------------------------------------------ |
| 1   | Import falls through to string `Type` when int parse fails | Label “Instance” would otherwise decode as total |

---

## Task 1: Save Spec Documentation

Create this folder with plan/shape/standards/references. **Status: active.**

---

## Task 2: Domain types + derive logic

`src/lib/metrics/` — MetricType union, normalize/displayValue/chartPoints by type, queries
use displayValue, mutations reject invalid types. Pure tests.

---

## Task 3: UI — Type select + chart/list wiring

MetricDrawer Type select; MetricChart passes metricType into chartPoints.

---

## Task 4: ACHXML import/export

decodeMetricType / encode reverse map; unit tests.

---

## Task 5: Verify, freeze, roadmap

Unit tests; freeze; update roadmap.

## Implementation notes

- No migration — column is already `text` default `total`.
- Instance vs Total same math deliberately until contribution/auto-target needs diverge.
- Label “Current total” kept for all types (AP uses it for waist).

## Follow-ups (new work — not this freeze)

- Entry types beyond `new_total` (Contribution, etc.)
- Auto-target / contribution targets interaction with Cumulative
- Verify ACHXML integer enum against a real multi-type export
- Type column on Metrics list grid
- Agent tool “log metric value” with type-aware semantics
