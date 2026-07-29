# Weekly Planning Wizard

**Status: frozen / complete** (2026-07-28)  
Spec folder: `agent-os/specs/2026-07-28-2144-weekly-planning-wizard/`

This document is the durable record of **what was built and why**. Future work that
extends the wizard should open a new delta-spec rather than treating this file as a
living control plane.

Phase 1's last big item: the guided weekly review that walks Result Areas → Goals → fixed
commitments → time budget → blocks on the calendar. Shaping notes live in `shape.md`.

---

## Final decisions (as built)

| Decision            | Choice                                                            |
| ------------------- | ----------------------------------------------------------------- |
| Container           | Full page `/schedule/plan?week=…&step=…`                          |
| Select Week         | Step 0 on the page, not a modal                                   |
| Resources           | Dropped; one weekly available-time number                         |
| Focus areas         | Write `nodes.focus`; also recorded on the plan entry              |
| Goal rewrite        | Per-plan history, never overwrites the goal                       |
| Commitments         | Per-plan `committed_minutes` per project                          |
| Collision avoidance | Pure `findFreeSlot`; also treats Time Chart areas as busy         |
| Auto-scheduler      | Out of scope                                                      |
| Mission edit        | Dedicated `saveMissionAction` (not full `saveNodeDetail` payload) |
| Entry point         | **Plan Week…** on the Weekly Schedule toolbar                     |

## Data model

```sql
weekly_plans
  id, user_id
  week_start          date-at-local-midnight, unique per user
  week_starts_on      smallint  -- 0=Sun, 1=Mon
  review_areas_goals  boolean   -- Achieve's "Perform Result Area & Goal Review"
  available_minutes   integer   -- budget for the week
  time_chart_id       uuid?     -- chart chosen for this week
  block_size_minutes  integer   -- step 5 default drop size
  avoid_collisions    boolean
  completed_at        timestamptz?
  timestamps

weekly_plan_entries
  id, user_id, plan_id, node_id           unique (plan_id, node_id)
  focus               boolean  -- result area marked focus for this week
  reviewed            boolean  -- step 1/2 "I looked at this"
  rewrite             text     -- goal / dream restatement for this week
  committed_minutes   integer? -- project time commitment for this week
  timestamps
```

Invariants:

- One plan per `(user_id, week_start)`; re-entering the wizard for a week resumes it.
- `week_start` is always the normalized start of week for `week_starts_on` — the mutation
  normalizes, callers may pass any day inside the week.
- Entries are keyed by node, not by step; a result area row and a project row are the same
  shape with different columns filled.
- Deleting a node cascades its entries. Deleting a plan cascades its entries.

## Code map

| Concern           | Location                                                     |
| ----------------- | ------------------------------------------------------------ |
| Wizard page       | `src/app/schedule/plan/page.tsx`                             |
| Server actions    | `src/app/schedule/plan/actions.ts`                           |
| Wizard UI         | `src/components/planning/*`                                  |
| Domain (pure)     | `src/lib/planning/{budget,blocks,review}.ts` + tests         |
| Queries/mutations | `src/lib/planning/{queries,mutations}.ts` + integration test |
| Schema            | `src/db/schema.ts` (`weeklyPlans`, `weeklyPlanEntries`)      |
| Migration         | `drizzle/0005_weekly_plans.sql`                              |

## Steps as built

| Step | Name              | What it writes                                               |
| ---- | ----------------- | ------------------------------------------------------------ |
| 0    | Select Week       | `weekly_plans` row (week, start day, review toggle)          |
| 1    | Result Areas      | `result_area_details.mission`, `nodes.focus`, entry `focus`  |
| 2    | Dreams & Goals    | entry `rewrite`, entry `reviewed`                            |
| 3    | Fixed Commitments | `weekly_plans.time_chart_id`, appointments (existing drawer) |
| 4    | Time Budget       | `weekly_plans.available_minutes`, entry `committed_minutes`  |
| 5    | Schedule Blocks   | appointments with `project_id` (existing mutation)           |

When `review_areas_goals` is false, steps 1–2 are omitted from the step strip.

## Acceptance criteria

- [x] "Plan Week…" on the Weekly Schedule toolbar opens the wizard for the shown week
- [x] Step 0 picks week + start-day + review toggle and creates/resumes one plan per week
- [x] Step 1 lists result areas, edits mission, toggles focus (and `nodes.focus` follows)
- [x] Step 2 lists dreams then goals at priority A in `new`/`active`, saves a rewrite each
- [x] Step 3 selects the week's Time Chart and creates fixed appointments on the week grid
- [x] Step 4 shows effort-left per project, takes a committed number, totals reconcile
      (available − committed = left) and flags over-commitment
- [x] Step 5 drags committed projects onto the week; remaining minutes count down; a drop
      that collides slides to the next free slot when Avoid Collisions is on
- [x] Finish marks the plan complete and returns to the Weekly Schedule for that week
- [x] Pure tests for budget math, block splitting, free-slot search, review selection
- [x] Integration tests incl. the cross-user case for every plan mutation
- [x] `npm test`, `npm run typecheck`, `npm run lint`, `npm run build` all clean
- [x] Browser smoke: Plan Week… → step 0 start → steps 1–5 render (driver + screenshots)

## Changes from original plan

| #   | Change                                                                                          | Why                                                                                                                                                                                            |
| --- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Achieve's per-resource loop in step 4 replaced by a single weekly available-time number         | Resource pools are out of scope project-wide; the loop existed to divide one person's week across work/personal identities, which Result Areas already express.                                |
| 2   | Achieve's "Rewrite" box stores per-plan history instead of overwriting the goal text            | The weekly restatement is the exercise; overwriting throws away the thing worth re-reading next week.                                                                                          |
| 3   | Wizard reads the outline once and drives every step from it, rather than a query per step       | `loadOutline` already returns effort rollups, L.A.P. priority, and depth for the whole tree in one round trip — the wizard's per-step needs are all slices of it.                              |
| 4   | Step 5 keeps a running **remaining** per project computed from appointments already on the week | Achieve shows "Time Remaining" for the project being dropped. Computing it from real appointments (rather than a counter) means the number survives a reload and manual edits on the calendar. |
| 5   | Mission save is a small dedicated action, not `saveNodeDetail`                                  | The detail save type requires a full core payload; the wizard only holds the mission field.                                                                                                    |

## Follow-ups (new work — not amendments to this frozen spec)

- Keyboard shortcut to open the wizard (Achieve: Ctrl+Shift+Z, W)
- Seed data with at least one priority-A goal so step 2 is non-empty in demos
- Per-area "projects & goals" grid polish (columns matching Achieve)
- Auto-scheduler / whole-week fill (explicitly out of scope here)
- Estimated-vs-actual reporting on a completed plan (wants time-tracking track)

## Status

**Frozen / complete** (2026-07-28). Verified with unit + integration tests, production build,
local migration, and browser smoke through all six steps.
