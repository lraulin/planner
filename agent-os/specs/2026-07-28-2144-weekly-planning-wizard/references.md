# References — Weekly Planning Wizard

## Screenshots

- `screenshots/weekly_planning/` — the five wizard steps + the Select Week dialog
- `screenshots/WeeklyPlanningWizardDropBlocks.png` — step 5 drop behaviour
- `screenshots/menus/` — where Achieve hangs the wizard (Tools ▸ Weekly Planning Wizard,
  `Ctrl+Shift+Z, W`)

## Code to follow

| Need                            | Existing example                                                      |
| ------------------------------- | --------------------------------------------------------------------- |
| Full-page sub-route of Schedule | `src/app/schedule/time-chart/[chartId]/page.tsx`                      |
| Week grid with drag + drop      | `src/components/schedule/WeekCalendar.tsx`                            |
| External drag source            | `src/components/schedule/ProjectsRail.tsx` (FullCalendar `Draggable`) |
| Server action wrapper           | `src/app/schedule/actions.ts` (`run()` + `ActionResult`)              |
| Mutation + user scoping         | `src/lib/schedule/mutations.ts`                                       |
| Integration test harness        | `src/lib/schedule/mutations.integration.test.ts`                      |
| Effort rollups / L.A.P.         | `src/lib/tree/derive.ts`, `src/lib/tree/types.ts`                     |
| Duration formatting             | `src/lib/tree/format.ts`                                              |
| Week/day math                   | `src/lib/schedule/geometry.ts`                                        |
| Recurrence expansion            | `src/lib/schedule/recurrence.ts`                                      |

## Prior specs

- `agent-os/specs/2026-07-28-1234-weekly-schedule/` — frozen; owns the calendar surface
  this wizard reuses. Its follow-up list names this wizard as the next Phase 1 item.
- `agent-os/specs/2026-07-28-1121-main-grid-tabs/` — the DataGrid the step 4 table borrows
  its column vocabulary from.
