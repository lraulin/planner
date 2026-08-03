# Metrics Tab + Import/Export (Core MVP)

**Status: frozen / complete** (2026-08-02)  
Spec folder: `agent-os/specs/2026-08-02-0912-metrics-tab/`

## Context

Achieve's **Tracking/Metrics** tab is a first-class product surface: a list of all metrics
(standalone or owned by a goal/dream), with a performance graph for the selected row, a
Metric Information form (General + Tracking), and a tracking-values history grid. Metrics
can be created on a goal form **or** without an owner.

Today the planner only has a thin Goal form child list (`node_items` kind `metric`: title,
category, question, target, active) with **no tracking history**, **no Metrics tab**, and
**no ACHXML import/export** of `Metrics` / `MetricTracking` (Tier B in
`docs/achieve-planner/file-formats.md`). Fitness already documented why goal metrics are the wrong
store for durable multi-entry history.

This slice completes **core metrics** as a Phase 2 Achieve surface plus own-your-data
import/export.

## Decisions

| Decision         | Choice                                                                   | Why                                                                                                                                                        |
| ---------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Depth            | **Core MVP**                                                             | Full AP has auto-target, day contribution targets, auto-increase, metric recurrence/reminders, graph zoom/print — defer those.                             |
| Storage          | **First-class `metrics` + `metric_entries`**                             | Owner optional; history must not cascade with goal delete (notes/fitness pattern). Achieve has separate Metrics / MetricTracking tables.                   |
| Goal form        | Same tables                                                              | Goal Metrics tab lists metrics where `ownerNodeId = goalId`; create associates owner.                                                                      |
| Standalone       | `ownerNodeId` null                                                       | Metrics tab can create without a goal; Group by Owner shows "None".                                                                                        |
| Goal delete      | **`ownerNodeId` SET NULL**                                               | Metric + entries survive; become ownerless rather than disappearing.                                                                                       |
| Graph            | **Inline SVG** (no new chart dependency)                                 | Repo keeps deps minimal; simple Actual vs Target line chart.                                                                                               |
| Status column    | **Deferred**                                                             | AP Status (On Schedule / Overdue) needs metric recurrence; show **Last value** (+ optional last date) instead.                                             |
| Migrate old rows | **One-shot data migration**                                              | Copy existing `node_items` kind `metric` into `metrics`, then stop writing that kind from the Goal form. Leave enum value for historical rows or clean up. |
| Import/export    | Map `Metrics` + `MetricTracking` in extras pass; export round-trips both | Aligns with notes/wishes extras pattern.                                                                                                                   |

## Acceptance criteria

- [x] **Metrics tab** (`/metrics`) in the tab strip: lists **all** metrics, Active only, Group by Owner, columns Active/Priority/Title/Category/Question/Target/Last Value.
- [x] **Create metric without a goal** from the Metrics tab; create **with** goal from Goal form Metrics section.
- [x] **Metric drawer/form**: General + Tracking (active, type Total, question, units, objective target, tracking grid).
- [x] **Add/edit/delete tracking entries**; **Last value** from latest entry by date.
- [x] **Performance graph** (SVG Actual + Objective); Show Legend / Show Objective.
- [x] **CSV export** of tracking rows from the metric form.
- [x] **ACHXML import** of `Metrics` + `MetricTracking` (merge/replace); **export** includes them.
- [x] Goal form Metrics list uses first-class metrics.
- [x] Pure logic tests + integration tests with **cross-user isolation**.
- [x] Spec frozen; `roadmap.md` and `achieve-file-formats.md` updated.

## Follow-ups (new work — not amendments to this frozen spec)

- Metric recurrence + reminders → Status On Schedule/Overdue
- Auto-target / contribution / auto-increase
- Graph zoom & print; auto-load graph on first paint if desired
- DataGrid chrome (filters, show fields) on Metrics list if needed
- Agent tools for logging a metric value
- Richer ACHXML field fidelity after inspecting a full AP metrics dump

## Out of scope (this slice)

- Auto-target / Recompute Targets / start value & date
- Mon–Sun contribution targets, default contribution
- Auto-increase type/amount/min/max
- Metric recurrence + reminders (and thus Overdue/On Schedule status)
- Graph zoom, scroll/scale persistence, Print…
- Agent API tools for metrics
- Contacts, Labels (other Tier B)
- Migrating fitness bodyweight into metrics (separate domains)

## Changes from original plan

| #   | Change                                                                                 | Why                                                         |
| --- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| 1   | Metrics list is a purpose-built table (not full DataGrid Show Fields stack)            | Faster MVP; columns + Group by Owner match the screenshots. |
| 2   | Goal Metrics panel lazy-loads on focus/hover rather than expanding goal detail payload | Keeps drawer light; same first-class tables.                |
| 3   | Chart loads on selection / “Load graph”, not automatically on first paint              | Fetch stays in event handlers (lint + clarity).             |

---

## Task 1: Save Spec Documentation

Create `agent-os/specs/2026-08-02-0912-metrics-tab/` with:

- **plan.md** — this plan (**Status: active**), empty Changes table
- **shape.md** — scope, decisions, product alignment, standards list
- **standards.md** — full text of: `development/testing`, `database/migrations`, `components/ux-principles`, `drawer-pattern`, `modal-pattern`, `responsive`, `api/response-format` (if import/export routes touched)
- **references.md** — Wish List tab, notes (optional owner), fitness (durable domain), GoalForm/itemKinds, achieve mapExtras/import/export, screenshots
- **visuals/** — copy from `screenshots/metrics/` (5 Achieve screenshots)

While this spec is **active**, material requirement/design/scope changes (including feedback on what was built) update plan/shape and append to **Changes from original plan**. Skip pure implementation details. Freeze when verified.

---

## Task 2: Schema — `metrics` + `metric_entries`

Add tables (names adjustable; intent fixed):

```
metrics
  id, userId
  ownerNodeId → nodes.id  ON DELETE SET NULL   # goal/dream; null = standalone
  title, category, question, description, reason (text defaults "")
  units (text, default "")
  active (bool, default true)
  priorityLetter, priorityRank
  metricType (text or enum, default "total")   # MVP only "total"; room for later
  objectiveTarget (numeric or text; prefer numeric null)
  sortKey (text)                               # global or per-owner list order
  externalSource, externalId                   # Achieve GUID idempotency (same pattern as nodes)
  createdAt, updatedAt
  indexes: userId; userId+ownerNodeId; external unique partial

metric_entries
  id, userId
  metricId → metrics.id ON DELETE CASCADE
  entryDate (timestamptz / date)
  entryType (text, default "new_total")        # AP "New Total" etc.; MVP store + display
  target (numeric nullable)                    # per-entry target snapshot
  value (numeric not null)
  sortKey or stable ordering by entryDate
  externalSource, externalId optional
  createdAt, updatedAt
```

- Generate migration via `npm run db:generate`; commit SQL + snapshot + journal.
- **Data migration** (SQL or one-shot script in migration): for each `node_items` where kind=`metric`, insert into `metrics` with ownerNodeId = nodeId, copy title/category/question/target/active/priority; delete or leave old rows (prefer delete after copy to avoid dual sources).
- Goal form + itemKinds: stop creating `kind: metric` node_items; wire to new API (Task 4–5). Enum value `metric` may remain for schema stability or be cleaned carefully.

**Invariants:** every query/mutation takes `userId` and scopes by it; cross-user tests required.

---

## Task 3: Domain lib — queries, mutations, derived fields

`src/lib/metrics/` (pure + DB):

- `queries.ts` — list all metrics for user (join owner name); list by ownerNodeId; load metric + entries; last value = entry with max entryDate (tie-break updatedAt/id).
- `mutations.ts` — create/update/delete metric; set/clear owner; create/update/delete entry; reorder if needed.
- `status.ts` / `derive.ts` — lastValue, lastDate; optional chart series points (date, value, target).
- `csv.ts` — pure: entries → CSV string (Date, Type, Target, Value).
- `*.test.ts` for derive/csv; `*.integration.test.ts` for mutations/queries **including second user fails read/update/delete**.

Do **not** put business logic in React components.

---

## Task 4: Metrics tab UI

- Add tab to `src/components/shell/tabs.ts` (label e.g. **Metrics** or **Tracking/Metrics** — prefer **Metrics** for strip width; match AP title where space allows).
- Route `src/app/metrics/page.tsx` + actions.
- Grid on shared `DataGrid` patterns (Wish List / Goals):
  - Columns: Active, Priority, Title, Category, Question, Target, Last Value
  - View: Active metrics (default); Group by Owner (None vs goal name)
  - Inline create row or toolbar New; open drawer on open/double-click
  - Split view: list above, **performance graph** below for selection (`Show Performance` default on)
- Graph: pure SVG component — Actual polyline; Objective as green horizontal line when set; simple legend checkboxes.
- Mobile: list + full-screen sheet (responsive standard); graph may stack or hide behind a detail toggle if dense.

---

## Task 5: Metric form + Goal form integration

- Drawer form (drawer-pattern): tabs **General** | **Tracking**
  - General: Title, Owner (Set… pick goal / clear), Category, Description, Reason (recurrence UI omitted/disabled with "later")
  - Tracking: Active, Type (Total fixed or single option), Question, Units, Objective Target value; Tracking Values grid (date, type, target, value); Current total/last; **CSV Export…** button (download blob)
- Goal form Metrics section: list metrics for this goal; add/remove/open same form; remove thin `list("metric")` node_items path.
- Footer Cancel | Save | Save & Close (or autosave if matching notes — prefer explicit save for multi-field form like other node drawers).

---

## Task 6: ACHXML import/export

- **mapExtras**: parse `Metrics` + `MetricTracking` rows; resolve owner via Goal/Dream GUID → `idByAch`; standalone when no owner.
- Field mapping: reverse-engineer from a real AP Full XML export when available (Lee's file); document unknown columns as warnings. Minimum: Title, Active, Priority, Category, Question, Target/objective, Units, Owner/Goal id, tracking Date/Value/Target/Type, Achieve GUIDs.
- **import write**: insert metrics/entries with `externalSource=achieve` + GUID; replace mode deletes user's metrics first (with entries cascade).
- **export**: emit Metrics + MetricTracking tables from DB; owner GUID from node's externalId when present else synthetic stable id.
- Unit tests on mapper with fixture XML snippet; integration test import path.
- Update `KNOWN_SKIP` / `EXTRAS_TABLES`; `docs/achieve-planner/file-formats.md` move Metrics to Done.

---

## Task 7: Verify, freeze spec, update roadmap

- Manually exercise: create standalone metric, log entries, graph, CSV; associate with goal; delete goal → metric remains ownerless; import sample if available.
- `npm run test:unit`, integration with Postgres, typecheck, lint, build as needed.
- Align plan/shape with as-built; fill **Changes from original plan**.
- Mark **Status: frozen / complete** (date); list follow-ups as new work (auto-target, recurrence, status, agent tools, etc.).
- Update `agent-os/product/roadmap.md` Phase 2 near-term surfaces: Metrics tab + Metrics/MetricTracking import/export delivered.

---

## Implementation notes

- **Chart library:** do not add recharts/d3 unless SVG proves inadequate.
- **Numeric storage:** use `numeric` for values/targets to preserve decimals (Adonis Index 1.618).
- **Owner picker:** reuse existing goal/outline pickers if any; else simple searchable list of goals/dreams.
- **Replace import:** must include metrics in the wipe set for replace mode.
- **No React component tests** per testing standard.

## Follow-ups (new work — not this freeze)

- Metric recurrence + reminders → Status On Schedule/Overdue
- Auto-target / contribution / auto-increase
- Graph zoom & print
- Agent tools for log metric value
- Full field fidelity for every AP Metrics column after inspecting a rich export
