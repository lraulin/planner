# References for Weekly Schedule

## Similar Implementations

### Tab strip (enable Weekly Schedule)

- **Location:** `src/components/shell/TabStrip.tsx`
- **Relevance:** Schedule tab is currently `built: false` with `href: null`. Flip to
  `/schedule` like Projects/Tasks.
- **Key patterns:** built tabs use `Link`; unbuilt stay disabled spans.

### Server actions + multi-user seam

- **Location:** `src/app/outline/actions.ts`, `src/lib/auth.ts`
- **Relevance:** schedule mutations follow the same `run()` + `{ ok, error }` +
  `revalidatePath("/", "layout")` + `getCurrentUserId()` pattern.
- **Key patterns:** never accept `userId` from the client; throw → action error string.

### Detail drawer

- **Location:** `src/components/detail/Drawer.tsx`, `NodeDetailDrawer.tsx`, `fields.tsx`,
  `ConfirmDialog.tsx`
- **Relevance:** appointment and Time Chart area forms reuse Drawer, field primitives, and
  dirty-close confirm.
- **Key patterns:** `{open && record && <Form />}`; focus trap; Escape.

### Tree / projects list data

- **Location:** `src/lib/tree/queries.ts` (`loadOutline`), `src/lib/tree/derive.ts`,
  `src/components/tabs/ProjectsGrid.tsx` (filtering/grouping ideas)
- **Relevance:** Projects sidebar needs project (and optional task) rows from the outline
  tree; `blockSizeMinutes` lives on `project_details`.

### Grid tab page shell

- **Location:** `src/app/projects/page.tsx`
- **Relevance:** RSC page loads data with `getCurrentUserId()`, renders `TabStrip` + client
  view. Schedule page should mirror this.

### Schema conventions

- **Location:** `src/db/schema.ts`
- **Relevance:** every table has `userId` → `users.id` cascade; enums via `pgEnum`;
  timestamps with timezone.

## Visuals

| File | What it shows |
| --- | --- |
| `visuals/WeeklyScheduleSS.png` | Classic Ideal Week: Time Chart blocks + appointments + project blocks |
| `visuals/Screenshot … 12.02.41 PM.png` | Empty week chrome, toolbar, mini-months, Projects rail |
| `visuals/Screenshot … 12.07.30 PM.png` | New Time Chart area form |
| `visuals/Screenshot … 12.08.11 PM.png` | Label color editor |
| `visuals/Screenshot … 12.13.56 PM.png` | Chart with multi-day Sleep + pink/green areas |
| `visuals/Screenshot … 12.17.56–12.18.58` | Appointments over chart; appointment form; recurrence; project drag results |

Also on disk (not copied): `screenshots/schedule/`.

## External

- **FullCalendar Standard (MIT):** timeGridWeek, interaction, background events.
  Docs: https://fullcalendar.io/docs — **do not** use Premium packages.
