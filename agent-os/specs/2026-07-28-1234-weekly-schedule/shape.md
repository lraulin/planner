# Weekly Schedule (Calendar + Time Chart) — Shaping Notes

**Status: frozen / complete** (2026-07-28)  
Authoritative as-built detail: `plan.md` (including **Changes from original plan**).

## Scope

Phase 1 **Weekly Schedule**: Achieve’s week grid with a **Time Chart** background
(ideal recurring week) and real **appointments** on top, including drag-from-projects.

### In scope (as shipped)

- Time Chart select / Edit / New; multi-day areas (`days_of_week` + Every day / Weekdays)
- Full-page Time Chart editor: template Sun–Sat, areas only, click-drag create
- Week time-grid via **FullCalendar Standard** (MIT); chart as background events on
  schedule view
- Full local appointment model + drawer form (including recurrence)
- Three-state appointment check: open / done / missed
- Projects sidebar with filters; drag project onto grid to schedule
- Mini-month navigator; Today / week navigation; Time Chart toolbar
- Dev server on port **3047**

### Out of scope

- Google Calendar OAuth / two-way sync
- Better Auth / real multi-user sessions (keep `getCurrentUserId()` seam)
- Guided weekly planning wizard
- Auto-scheduling from effort/deadlines into free slots
- Appointment **done** → Actual Effort / project rollups (time-tracking track)
- Notes tab, Pomodoro, printing
- Month/day primary views
- First-party attachment blob hosting

## Decisions

- **Own calendar first** — utility without Google (Time Chart + project blocks close the
  plan→time loop).
- **Auth deferred** — multi-user-ready schema; no Better Auth in this slice.
- **FullCalendar Standard only** — free MIT week grid; background events map to Time
  Chart on the main schedule; no Premium packages. Domain hand-rolled.
- **Multi-day Time Chart areas** — day-of-week checkboxes + presets (improvement over
  Achieve’s per-day Ctrl+drag duplicates).
- **Time Chart editor is a full page** (`/schedule/time-chart/[id]`), not a drawer,
  modal, or top-level tab — Achieve’s separate window as a Schedule sub-route. Side
  panel for multi-day / color / result area.
- **Drawers not modals** for **appointment** editing only (`ux-principles`).
- **Appointments**: free-floating + project-linked; full local field set so Google sync
  can attach later without a schema rewrite.
- **Three-state check** (open / done / missed); effort rollup deferred.

## Context

- **Visuals:** `visuals/` (from `screenshots/schedule/` + `WeeklyScheduleSS.png`;
  gitignored)
- **References:** see `references.md` (as-built paths)
- **Product alignment:** Phase 1 weekly calendar delivered in `roadmap.md`

## Standards Applied

- `components/ux-principles.md` — drawers not stacked modals; ConfirmDialog for dirty close
- `components/drawer-pattern.md` — appointment forms only

## Status

**Closed** 2026-07-28. Spec is frozen; see `plan.md` for as-built model, code map,
acceptance criteria, and changes from the original plan.
