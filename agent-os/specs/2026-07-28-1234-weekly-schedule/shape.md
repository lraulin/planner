# Weekly Schedule (Calendar + Time Chart) — Shaping Notes

## Scope

Phase 1 **Weekly Schedule**: Achieve’s week grid with a **Time Chart** background
(ideal recurring week) and real **appointments** on top, including drag-from-projects.

### In scope

- Time Chart create/edit/select; areas with multi-day checkboxes (+ Weekdays / Every day)
- Week time-grid via **FullCalendar Standard** (MIT); chart as background events
- Full local appointment model + form (subject, location, times, all-day, completed,
  reminder, show-as, priority, project link, notes, contexts, private, recurrence)
- Projects sidebar with filters; drag project onto grid to schedule
- Mini-month navigator; Today / week navigation; Time Chart toolbar

### Out of scope

- Google Calendar OAuth / two-way sync
- Better Auth / real multi-user sessions (keep `getCurrentUserId()` seam)
- Guided weekly planning wizard
- Auto-scheduling from effort/deadlines into free slots
- Notes tab, Pomodoro, printing
- Month/day primary views

## Decisions

- **Own calendar first** — utility without Google (Time Chart + project blocks close the
  plan→time loop). Roadmap already places Google after a schedule surface exists.
- **Auth deferred** — multi-user-ready schema; no Better Auth in this slice.
- **FullCalendar Standard only** — free MIT week grid; background events map to Time
  Chart; no Premium packages. Domain (schema, recurrence, drawers, projects rail)
  hand-rolled.
- **Multi-day Time Chart areas** — day-of-week checkboxes + presets (improvement over
  Achieve’s per-day Ctrl+drag duplicates).
- **Time Chart editor is a full page** (`/schedule/time-chart/[id]`), not a drawer —
  template week Sun–Sat, areas only, click-drag create (Achieve’s separate window).
- **Drawers not modals** for **appointment** editing (`ux-principles`).
- **Appointments**: free-floating + project-linked; full Achieve-ish field set locally so
  Google sync can attach later without a schema rewrite.
- **Three-state check** (open / done / missed); effort rollup deferred to time tracking.

## Context

- **Visuals:** `visuals/` (from `screenshots/schedule/` + `WeeklyScheduleSS.png`)
- **References:** TabStrip, outline/grids, drawers, tree queries, auth seam — see
  `references.md`
- **Product alignment:** Phase 1 “Weekly calendar + time blocking” in `roadmap.md`;
  mission’s time-blocked calendar; tech-stack multi-user seam

## Standards Applied

- `components/ux-principles.md` — drawers not stacked modals; keyboard-first; ConfirmDialog
- `components/drawer-pattern.md` — open/close/dirty/save for appointment forms

## Status

**Closed** 2026-07-28 — see `plan.md` Status section.
