# Weekly Schedule (Calendar + Time Chart)

Spec folder (on Task 1): `agent-os/specs/2026-07-28-1234-weekly-schedule/`

## Context

Phase 1 still needs the **Weekly Schedule**: Achieve’s week grid with a **Time Chart**
background (ideal recurring week) and real **appointments** on top, including drag-from-
projects. Outline, detail forms, and main grid tabs are done; the Schedule tab is still a
disabled placeholder in `TabStrip`.

**Recommendation (confirmed):** build our **own** calendar now. It has real utility without
Google — the Time Chart alone is a planning surface, and project-linked blocks close the
plan→time loop. Defer **Google Calendar** and **real auth** (Phase 2); keep the
`getCurrentUserId()` multi-user seam. Schema should be sync-friendly later, but no OAuth
or external event IDs in this slice.

Screenshots: `screenshots/schedule/` + `screenshots/WeeklyScheduleSS.png`.

## Decisions

| Decision | Choice |
| --- | --- |
| MVP slice | Full Weekly Schedule: Time Chart + appointments + Projects sidebar |
| Google / auth | Deferred (Phase 2) |
| Time Chart multi-day | Day-of-week checkboxes (+ Weekdays / Every day presets) on one area definition |
| Appointment types | Free-floating + project-linked (drag from Projects panel) |
| Appointment depth | Full local model + form (Achieve-parity fields, including recurrence) |
| Chrome | Week grid, Time Chart toolbar, mini-month nav, Projects sidebar |
| Forms | Drawers, not Achieve modals (`ux-principles`) |
| Calendar library | **FullCalendar Standard (MIT, free)** for the week time-grid surface only — see
  “Library choice” below. Domain (schema, Time Chart, recurrence, drawers, projects
  rail) stays hand-rolled. No Premium plugins. |
| Weekly planning wizard | **Out of scope** (separate roadmap item) |
| Auto-scheduler | **Out of scope** (no “fill free slots from task list” algorithm yet) |

### Library choice (Free 3rd party vs hand-rolled)

**Recommendation: FullCalendar Standard for the week grid; hand-roll everything else.**

| Option | License / cost | Fits our needs? |
| --- | --- | --- |
| **FullCalendar Standard** | MIT, free | Best free fit. Week time-grid, drag/resize, select-to-create, external drop (projects), **background events** for Time Chart layer, React package. |
| FullCalendar Premium | ~$480/dev/yr | Not needed (resource timelines, etc.). Avoid. |
| react-big-calendar | MIT, free | Weaker first-class background events; more DIY for dual-layer + polish. |
| Fully hand-rolled grid | $0 | Maximum Achieve fidelity and zero deps, but weeks of hit-testing, scroll sync, a11y, edge cases for little product gain. |

**Why FullCalendar maps well to Achieve’s model**

1. **Time Chart as background events** — FC’s `display: "background"` is non-editable
   wallpaper under real events. Expand each multi-day chart area into dated background
   instances for the visible week. Editing charts stays in our separate editor (correct:
   background events are not draggable/resizable in FC).
2. **Appointments as normal events** — free + project-linked; drag, resize, create via
   time-range select.
3. **Project list drag** — free-tier external drop / `eventReceive`.
4. **Cost / lock-in** — Standard is MIT forever; Premium is the paid trap. We never import
   Premium packages.

**What we still write ourselves**

- Schema, queries, mutations, recurrence expand (tested pure functions)
- Time Chart editor (multi-day checkboxes, labels)
- Appointment drawer (full fields)
- Projects sidebar + mini-month chrome around the grid
- Theming to approach Achieve’s look
- Achieve-specific gestures FC doesn’t have natively (e.g. **Ctrl+drag duplicate** —
  implement via event handlers / custom logic on top)

**Rejected: full hand-roll of the grid** — the dual-layer concern is largely solved by
background events; the hard remaining work is product domain, not canvas math. Same
spirit as rejecting TanStack Table for the outline: use a free tool where it owns the
hard generic half, hand-write the app-specific half.

**Rejected: no library and “ship something crude”** — a bad week grid is unusable;
FC’s free tier is good enough to daily-drive.

### Data model (proposed)

```
time_charts          user-owned named charts (e.g. "Ideal Week")
time_chart_areas     blocks on a chart: name, result_area_id?, days_of_week[],
                     start_minute, duration_minutes, label styling, description

appointments         real events: subject, location, start_at, end_at, all_day,
                     completed, reminder_minutes?, show_as, priority, project_id?,
                     notes, contexts[], private, recurrence fields
```

- **Time Chart areas** are templates (weekday + time-of-day), not dated instances.
- **Appointments** are dated. Project drag creates an appointment with `project_id` set
  (and subject defaulting to the project name). Task-level scheduling can ride the same
  table later via optional `task_id` if needed; v1 drag is from the Projects list as in
  Achieve screenshots.
- **Recurrence** stored on appointments so Google sync can map later; expand occurrences
  for the visible week in pure functions (tested), not by materializing every future row.
- All tables: `user_id` + `getCurrentUserId()` scope.

### UX notes from screenshots

- Time Chart editor: full Sun–Sat week; drag to create areas; Edit Time Chart / New.
- Area form: Name, Result Area, Weekday (we upgrade to multi-day checkboxes), Start,
  Duration, Label (colors/hatch), Description.
- Week view: chart blocks as colored background; appointments as white bordered cards
  (checkbox, optional sun/priority affordances as we match fidelity).
- Click-drag empty slot → create; drag move/resize; Ctrl+drag duplicate; type to name.
- Right: mini-months + Projects tree (Show Completed / Group by Result Area / Show Tasks /
  Sort by Priority).

## Task 1: Save spec documentation

Create `agent-os/specs/2026-07-28-1234-weekly-schedule/` with:

- **plan.md** — this full plan
- **shape.md** — shaping notes (scope, decisions, context)
- **standards.md** — full text of `components/ux-principles.md` and
  `components/drawer-pattern.md` with “why it applies” preambles
- **references.md** — pointers to TabStrip, grids, drawers, tree queries, auth seam,
  screenshots
- **visuals/** — copy of key files from `screenshots/schedule/` and
  `screenshots/WeeklyScheduleSS.png`

## Task 2: Schema — Time Charts + Appointments

Add Drizzle tables + migration for `time_charts`, `time_chart_areas`, and `appointments`
(including recurrence columns designed for later Google mapping). Enums as needed
(`show_as`, recurrence frequency). Seed one empty default Time Chart for the dev user.

**Verify:** `npm run db:generate` / migrate; typecheck; seed succeeds.

## Task 3: Domain layer — queries, mutations, recurrence expand

- Load charts, areas, appointments in a date range (visible week).
- CRUD mutations scoped by `user_id`.
- Pure `expandRecurrence` / week geometry helpers (snap intervals, minutes-from-midnight,
  day columns) with unit tests.

**Verify:** vitest for recurrence and geometry edge cases.

## Task 4: Schedule route shell + Time Chart toolbar

- Enable **Weekly Schedule** in `TabStrip` → `/schedule`.
- Page shell: toolbar (Time Chart select, Edit, New, Today), week navigation, layout for
  grid + right rail.
- Persist selected chart + “current week start” sensibly (URL and/or localStorage).

**Verify:** tab navigates; empty week grid chrome renders.

## Task 5: Week grid (FullCalendar Standard)

- Add MIT packages only: `@fullcalendar/react`, `@fullcalendar/core`,
  `@fullcalendar/timegrid`, `@fullcalendar/interaction` (and daygrid only if needed for
  all-day strip). **No Premium packages.**
- Wire `timeGridWeek`: appointments as events; Time Chart expanded for the visible week
  as `display: "background"` events (colors from area / result area).
- Select-to-create, drag move/resize, external drop target for projects.
- Ctrl+drag (or equivalent) duplicate via custom handlers if stock API lacks it.
- Theme CSS toward Achieve (hour lines, day headers); current-time indicator is built-in.

**Verify:** create/move/resize; Time Chart shows under appointments; no Premium imports.

## Task 6: Time Chart editor

- Drawer or full-panel editor (prefer drawer / dedicated view consistent with standards —
  large enough for a week template; Achieve uses a separate window — we use in-app full
  width under the tab strip or a wide drawer).
- CRUD areas; **multi-day checkboxes** + Weekdays / Every day presets.
- Label styling (fore/back color at minimum; hatch optional if cheap).
- Optional Result Area link for color defaults.

**Verify:** multi-day Sleep block appears on all selected days in week view.

## Task 7: Appointment form (full local fields)

- Drawer form: subject, location, start/end, all-day, completed, reminder, show-as,
  priority, project link, notes, contexts, private, recurrence dialog (daily/weekly/
  monthly/yearly + range).
- Open on double-click / Enter; dirty close → ConfirmDialog.
- Server actions; optimistic updates on the grid where easy.

**Verify:** round-trip all fields; weekly recurrence shows on correct days.

## Task 8: Projects sidebar + drag-to-schedule

- Right rail: mini-month navigator + projects tree from `loadOutline`.
- Toggles: Show Completed, Group by Result Area, Show Tasks, Sort by Priority (match
  Achieve where cheap; degrade gracefully).
- Drag project onto grid → appointment with `project_id` + default duration (project
  `blockSizeMinutes` or a sensible default, e.g. 60).

**Verify:** drag creates linked appointment; filters affect the list.

## Task 9: Polish, seed demo data, verify

- Keyboard / a11y pass on focus and Escape.
- Optional seed appointments + sample Ideal Week chart for demos.
- `typecheck`, `test`, `lint`; manual walkthrough against screenshots.
- Update `roadmap.md` Phase 1 checkbox when done (implementation time).

## Out of scope (this spec)

- Google Calendar OAuth / two-way sync
- Better Auth / real multi-user sessions
- Guided weekly planning wizard
- Auto-scheduling from effort/deadlines into free slots
- Notes tab, Pomodoro, printing
- Month/day primary views (week is the product surface; mini-month is navigation only)

## Standards applied

- `components/ux-principles.md` — drawers not stacked modals; keyboard-first; progressive
  disclosure; ConfirmDialog for destructive / dirty close
- `components/drawer-pattern.md` — open/close/dirty/save action pattern for appointment
  and Time Chart area editing

## Open questions (resolved in shaping)

- Own calendar first vs wait for Google → **own first**
- Auth before Google → **yes, both deferred**
- Multi-day Time Chart UX → **day checkboxes + presets**
- Appointment field depth → **full local form**
- Chrome → **full week UI + projects sidebar**

---

Plan structure ready for approval. Task 1 saves all shaping docs; then implementation
tasks 2–9 proceed in order (4–8 can partially overlap after schema + domain exist).
