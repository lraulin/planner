# Shaping — Weekly Planning Wizard

**Status: frozen / complete** (2026-07-28)

## The problem

Everything Phase 1 needs to _plan_ a week now exists as separate surfaces: the outline, the
grids, goals, the weekly calendar with its Time Chart. What is missing is the **loop that
walks you through them in order once a week** — Achieve's Weekly Planning Wizard, which is
the single feature that turns a pile of well-modelled data into a plan you actually work.

Without it the app is a good database of intentions. With it, Sunday evening has a script.

## Source material

`screenshots/weekly_planning/` — Achieve's wizard, captured 2026-07-28:

| Screen      | What it does                                                                                                                                              |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Select Week | Week-of date, "Start week on" (Mon/Sun), and a **Perform Result Area & Goal Review** checkbox that decides whether steps 1–2 are part of this run.        |
| Step 1      | Per Result Area: description, **Mission** (editable), Guiding Principles grid, **"Make this a Focus Area for this week"**, and its Projects & Goals grid. |
| Step 2      | Per Dream and per Goal (only `New`/`Active` at priority A): read-only description plus a **Rewrite** box. Restating the goal in your own words weekly.    |
| Step 3      | Pick the week's Time Chart; block off meetings and other fixed appointments on the week grid.                                                             |
| Step 4      | Per **Resource**: Available Time, a Project Commitments grid with an editable **Time Committed** column, and Total Committed / Time Left readouts.        |
| Step 5      | Drag project blocks onto the week. **Block Size** dropdown, **Avoid Collisions** toggle, Stop Drop; Time Remaining counts down per project.               |

## Decisions

| Question                      | Decision                                                                                                                                                                             |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Container                     | **Full page** at `/schedule/plan`, like the Time Chart editor. Not a drawer (too small), not a top-level tab (chrome clutter). Weekly Schedule owns the entry point.                 |
| Achieve's "Select Week" modal | Becomes **step 0 of the same page**, not a modal. `ux-principles.md` reserves modals for destructive/blocking decisions; choosing a week is neither.                                 |
| Step navigation               | Step strip along the top (Achieve's Step 1–5 tabs) + Back/Next. Steps are freely navigable; nothing is gated.                                                                        |
| Resources (Achieve step 4)    | **Dropped.** Resource pools were already declared out of scope in the detail-forms spec. One "available time this week" number for the whole week replaces the per-resource loop.    |
| Focus areas                   | Write straight to the existing `nodes.focus` flag — the outline already filters on it. The plan additionally records which areas were focused, so history survives a later un-focus. |
| Goal "Rewrite"                | Stored **per plan**, not overwriting the goal. The point of the exercise is the weekly restatement; keeping each week's wording is what makes it reviewable.                         |
| Commitments                   | Stored per plan per project (`committed_minutes`). `project_details.time_per_week_minutes` stays the _standing_ intent; a plan row is _this week's_ number.                          |
| Step 5 collision avoidance    | Pure function that slides a proposed block forward to the next free slot within the day. Ours also respects the Time Chart when asked, which Achieve does not.                       |
| Auto-scheduler                | Still out of scope. The wizard proposes slots on drop; it never fills the week for you.                                                                                              |

## Shape of the data

Two tables, in the style the codebase already uses (one row per touched node rather than a
table per step):

```
weekly_plans          one per (user, week_start)
weekly_plan_entries   one per (plan, node) — rewrite, committed_minutes, focus
```

Everything else the wizard writes lands in tables that already exist: mission on
`result_area_details`, focus on `nodes`, blocks as `appointments` with a `project_id`.

## Out of scope

- Resources / resource pools (Achieve step 4's outer loop)
- Achieve's Daily Planning Wizard, Task Organizer, Next Action Capture, Wish Brainstorming
- Auto-scheduling the whole week from effort and deadlines
- Estimated-vs-actual reporting on the completed plan (wants the time-tracking track)
- Printing / weekly plan export
