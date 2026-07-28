# Weekly Schedule (Calendar + Time Chart)

**Status: frozen / complete** (2026-07-28)  
Spec folder: `agent-os/specs/2026-07-28-1234-weekly-schedule/`

This document is the durable record of **what was built and why**. Future work that
extends the calendar should open a new delta-spec (or amend with a dated change section)
rather than treating this file as a living control plane.

---

## Context

Phase 1 **Weekly Schedule**: Achieve’s week grid with a **Time Chart** background
(ideal recurring week) and real **appointments** on top, including drag-from-projects.
Built as our **own** calendar (utility without Google). Google Calendar and real auth stay
Phase 2; schema remains multi-user-ready via `getCurrentUserId()`.

Screenshots: `screenshots/schedule/` + `screenshots/WeeklyScheduleSS.png` (also under
`visuals/`, gitignored).

---

## Final decisions (as built)

| Decision | Choice |
| --- | --- |
| MVP slice | Full Weekly Schedule: Time Chart + appointments + Projects sidebar |
| Google / auth | Deferred (Phase 2) |
| Calendar library | **FullCalendar Standard v6 (MIT)** only — no Premium. Domain hand-rolled. |
| Time Chart multi-day | One area row with `days_of_week[]` + **Every day / Weekdays** presets |
| Time Chart editor UI | **Full page** `/schedule/time-chart/[chartId]` (not drawer/modal/tab) |
| Time Chart create UX | Click-drag on template week (like appointments); side panel for details |
| Appointment types | Free-floating + project-linked (drag from Projects rail) |
| Appointment form | Drawer with full local fields + recurrence |
| Appointment check | **Three-state** `open` → `done` → `missed` (Achieve checkbox); not a boolean |
| Check → effort | Deferred to Pomodoro/time-tracking track (session log, not ad-hoc writes) |
| Chrome | Week grid, Time Chart toolbar, mini-month, Projects sidebar |
| Dev port | **3047** (`npm run dev` / `npm start`) to avoid clashing with other apps |
| Weekly planning wizard | Out of scope (next Phase 1 item) |
| Auto-scheduler | Out of scope |

### Library choice

FullCalendar Standard owns the week time-grid (select, drag/resize, external drop,
background events for Time Chart on the main schedule). Premium packages are never used.

We hand-roll: schema, queries/mutations, recurrence expand, Time Chart template editor,
appointment drawer, projects rail, theming, Ctrl/Cmd+drag duplicate, three-state check.

### Data model (as built)

```
time_charts
  id, user_id, name, timestamps

time_chart_areas
  id, user_id, time_chart_id, name, result_area_id?
  days_of_week smallint[]   -- 0=Sun … 6=Sat (multi-day in one row)
  start_minute, duration_minutes
  label_enabled, fore_color, back_color, description

appointments
  id, user_id, subject, location, start_at, end_at, all_day
  check_state  appointment_check  -- open | done | missed  (not boolean completed)
  reminder_minutes?, show_as, priority_*, project_id?
  notes, contexts[], private
  recurrence_frequency, recurrence_interval, recurrence_by_weekday[]
  recurrence_end, recurrence_count?, recurrence_until?
```

Migrations: `0003` (charts + appointments), `0004` (`check_state` replaces `completed`).

Invariants:

- Time Chart areas are **templates** (weekday + clock), not dated instances.
- Appointments are **dated**; recurrence is expanded in pure code for the visible week
  (`expandRecurrence`), not materialised as one row per occurrence.
- All tables scoped by `user_id` + `getCurrentUserId()`.
- Project drag creates an appointment with `project_id` and default duration **60**
  (or task effort-left capped when Show Tasks is on). `project_details.blockSizeMinutes`
  is not wired yet.

### Code map (as built)

| Concern | Location |
| --- | --- |
| Schedule page | `src/app/schedule/page.tsx` |
| Time Chart editor page | `src/app/schedule/time-chart/[chartId]/page.tsx` |
| Server actions | `src/app/schedule/actions.ts` |
| Schedule UI | `src/components/schedule/*` |
| Domain | `src/lib/schedule/*` |
| Schema | `src/db/schema.ts` (`timeCharts`, `timeChartAreas`, `appointments`) |
| Seed Ideal Week | `src/db/seed.ts` |

---

## Acceptance criteria (met)

- [x] Weekly Schedule tab navigates to a usable week grid on **:3047**
- [x] Select active Time Chart; background areas render under appointments
- [x] Create / move / resize appointments; open full drawer; save recurrence
- [x] Three-state checkbox on events cycles and stays clickable after re-render
- [x] Drag project from rail → linked appointment
- [x] Edit/New Time Chart opens full-page Sun–Sat template editor (areas only)
- [x] Click-drag create area; multi-day via panel; back returns to schedule
- [x] Seed provides Ideal Week + sample appointment
- [x] Tests for geometry, recurrence, check-state cycle; typecheck clean

---

## Changes from original plan

Material refinements that appeared after shaping / first implementation. Minor code
polish is omitted.

| # | Change | Why |
| --- | --- | --- |
| 1 | **FullCalendar Standard** instead of hand-rolled week grid | Free MIT surface already has dual-layer (background events), drag/select/external drop; hand-roll was weeks of canvas math with little product gain. Premium explicitly rejected. |
| 2 | **Full-page Time Chart editor** (`/schedule/time-chart/[id]`) instead of drawer (or main nav tab) | Achieve’s separate window needs a full week grid + drag-create; drawer too small; a top-level tab would clutter chrome. Sub-route keeps Weekly Schedule as the only tab. Side panel for multi-day/color. |
| 3 | **Click-drag create** in Time Chart editor (not only form-first “New area”) | Matches Schedule and Achieve; multi-day checkboxes remain a convenience on the selected area, not the only create path. |
| 4 | **`check_state` enum** (`open` / `done` / `missed`) replaces boolean `completed` | Achieve’s three-state checkbox. Migration `0004`. Effort contribution from **done** deferred until session log / time-tracking exists (project effort is task rollup today). |
| 5 | **React `eventContent` for appointment checkboxes** | First implementation attached click handlers in `eventDidMount`; FC re-renders DOM on state change and dropped listeners. React handlers rebind every render. |
| 6 | **Luminance-based Time Chart label colors** + no bg-event opacity | Dark chrome + stored fore colors + FC ignoring `textColor` on background events made labels unreadable. `contrastText()` + `eventDidMount` force readable labels. |
| 7 | **Projects rail TypeIcon sizing** | SVG has no default size; outline uses `h-3.5 w-3.5` — rail was missing that (icons huge, labels crushed). |
| 8 | **Dev/start port 3047** | User routinely has other Next apps on 3000/3002. |
| 9 | **Attachments strategy** (roadmap only, not this feature) | Captured under Phase 2: links-first, then Drive/Dropbox pickers; no S3 hosting by default. Adjacent product thinking during this cycle. |

---

## Implementation tasks (historical)

Tasks 1–9 from the original plan were completed as listed under **Status** below.
Original task text is retained only as history; the **Final decisions** and **Code map**
above are authoritative.

### Task 1: Spec documentation — done

### Task 2: Schema — done (`0003`, later `0004` for check_state)

### Task 3: Domain layer — done

### Task 4: Schedule route shell — done (`/schedule`, URL `week` + `chart`)

### Task 5: Week grid (FullCalendar) — done

### Task 6: Time Chart editor — done as **full page**, not drawer

### Task 7: Appointment form — done (drawer; three-state check)

### Task 8: Projects sidebar + drag — done (duration default 60)

### Task 9: Polish / seed / roadmap — done

---

## Status (closed)

**Shipped** 2026-07-28. Roadmap Phase 1 item **Weekly calendar + time blocking** marked ✅.

| Task | Outcome |
| --- | --- |
| 1 Spec docs | This folder |
| 2 Schema | `time_charts`, `time_chart_areas`, `appointments` + `check_state` |
| 3 Domain | queries/mutations, recurrence + geometry + checkState tests |
| 4 Shell | `/schedule`, TabStrip, toolbar, week nav |
| 5 Week grid | FC Standard, background chart, drag/create/drop |
| 6 Time Chart editor | `/schedule/time-chart/[id]` template week + panel |
| 7 Appointments | Drawer + recurrence + three-state checkbox |
| 8 Projects rail | Mini-month, filters, drag-to-schedule |
| 9 Polish | Seed Ideal Week, contrast/icons, port 3047, roadmap ✅ |

### Follow-ups (new work — not amendments to this frozen spec)

- Keyboard/a11y pass on the calendar
- Hatch patterns on Time Chart labels (optional fidelity)
- Wire `blockSizeMinutes` when dragging projects
- Appointment **done** → Actual Effort (time-tracking track)
- Recurring series edit UX (“this occurrence vs entire series”)
- Google Calendar sync (Phase 2)
- Guided weekly planning wizard (next Phase 1 item)

---

## Out of scope (this spec)

- Google Calendar OAuth / two-way sync
- Better Auth / real multi-user sessions
- Guided weekly planning wizard
- Auto-scheduling from effort/deadlines into free slots
- Notes tab, Pomodoro, printing
- Month/day primary views (week is the product surface; mini-month is navigation only)
- First-party file hosting for attachments (roadmap: URL links / Drive pickers later)

## Standards applied

- `components/ux-principles.md` — drawers not stacked modals for appointments; keyboard-
  first where practical; ConfirmDialog for dirty close
- `components/drawer-pattern.md` — appointment form open/close/dirty/save pattern  
  (Time Chart editor intentionally **not** a drawer)

## Open questions (resolved)

| Question | Resolution |
| --- | --- |
| Own calendar first vs wait for Google? | Own first |
| Auth before Google? | Both deferred; schema ready |
| Multi-day Time Chart UX? | Day checkboxes + presets; drag-create on editor grid |
| Appointment field depth? | Full local form |
| Time Chart container? | Full page under Schedule, not drawer/tab/modal |
| Check → project effort? | Defer to time-tracking track |
