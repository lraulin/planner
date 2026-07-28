# References for Weekly Schedule

**Status: frozen / complete** (2026-07-28)

## As-built code (primary)

| Area | Path |
| --- | --- |
| Schedule route | `src/app/schedule/page.tsx` |
| Time Chart editor route | `src/app/schedule/time-chart/[chartId]/page.tsx` |
| Server actions | `src/app/schedule/actions.ts` |
| Schedule shell + toolbar | `src/components/schedule/ScheduleView.tsx` |
| Week grid (FC) | `src/components/schedule/WeekCalendar.tsx` |
| Appointment drawer | `src/components/schedule/AppointmentDrawer.tsx` |
| Time Chart editor view | `src/components/schedule/TimeChartEditorView.tsx` |
| Time Chart area panel | `src/components/schedule/TimeChartAreaPanel.tsx` |
| Projects rail | `src/components/schedule/ProjectsRail.tsx` |
| Mini-month | `src/components/schedule/MiniMonth.tsx` |
| Domain | `src/lib/schedule/{queries,mutations,recurrence,geometry,checkState,timeChartTemplate}.ts` |
| Schema | `src/db/schema.ts` — `timeCharts`, `timeChartAreas`, `appointments` |
| Migrations | `drizzle/0003_complete_black_knight.sql`, `drizzle/0004_appointment_check.sql` |
| Seed | `src/db/seed.ts` (Ideal Week + sample appointment) |
| Tab strip | `src/components/shell/TabStrip.tsx` (`schedule` → `/schedule`) |
| FC theming | `src/app/globals.css` (`.schedule-calendar`, `.time-chart-editor`) |

## Patterns borrowed (pre-existing)

### Server actions + multi-user seam

- **Location:** `src/app/outline/actions.ts`, `src/lib/auth.ts`
- **Used as:** `run()` + `{ ok, error }` + `revalidatePath("/", "layout")` +
  `getCurrentUserId()` — never trust client `userId`.

### Detail drawer (appointments only)

- **Location:** `src/components/detail/Drawer.tsx`, `fields.tsx`, `ConfirmDialog.tsx`
- **Used as:** appointment create/edit; dirty close. Time Chart editor is **not** a drawer.

### Outline / projects data

- **Location:** `src/lib/tree/queries.ts` (`loadOutline`)
- **Used as:** Projects rail list; project drag subject + optional task duration.

### Page shell

- **Location:** `src/app/projects/page.tsx`
- **Used as:** RSC load + `TabStrip` + client view pattern for `/schedule`.

## Visuals

| File | What it shows |
| --- | --- |
| `visuals/WeeklyScheduleSS.png` | Classic Ideal Week: chart + appointments + project blocks |
| `visuals/Screenshot … 12.02.41 PM.png` | Empty week chrome, toolbar, mini-months, Projects rail |
| `visuals/Screenshot … 12.07–12.13` | Time Chart area form / multi-day Sleep |
| `visuals/Screenshot … 12.17–12.18` | Appointments, form, recurrence, project drag |

On disk (gitignored): `screenshots/schedule/`.

## External

- **FullCalendar Standard v6 (MIT):** `@fullcalendar/react`, `core`, `timegrid`,
  `interaction`, `daygrid`. **Do not** add Premium packages.
- Docs: https://fullcalendar.io/docs
