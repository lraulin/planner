# The Day tab — Franklin Covey daily list, master-list integration, and journal

**Status: active** (2026-07-31)

## Context

See `shape.md` for the intent. The short version: give the system a real daily list — jot
what you are doing today, rank it A/B/C, check it off — **as a first-class concept wired into
Achieve at every seam**, rather than either a parallel task system or another Today Project
built by bending fields that mean something else.

## Data model (as built)

One new table, `daily_items` (`src/db/schema.ts`), migration `drizzle/0015_square_beyonder.sql`.
No existing table changed.

| Column                              | Notes                                                                                                                                                                                                                                             |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `day`                               | `date`, not a timestamp. A calendar day has no time component, and a timestamp would let a UTC server shift Tuesday into Monday. `YYYY-MM-DD` strings are already the app-wide convention (`src/lib/chooser/dates.ts`, `src/lib/tree/status.ts`). |
| `node_id`                           | Nullable, `ON DELETE SET NULL`. Null = jotted line; set = task from the master list.                                                                                                                                                              |
| `title`                             | Always stored. For a jotted line it _is_ the item; for a node-backed one it is a snapshot, so deleting the task later leaves an honest record instead of a blank row. Display prefers the node's live name while it exists.                       |
| `priority_letter` / `priority_rank` | Reuses `priorityLetterEnum`. The day's own ABC — a different question from both outline priority and TC Priority.                                                                                                                                 |
| `state`                             | Reuses `nodeStateEnum`, which already covers most Covey marks: In Process → `in_progress`, Delegated → `delegated`, Deleted → `cancelled`.                                                                                                        |
| `completed_at`                      | **Authoritative for "done on this day".** Cannot be derived — see below.                                                                                                                                                                          |
| `forwarded_to`                      | The later day this row was carried to. Covey's forwarded mark.                                                                                                                                                                                    |

Two indexes carry meaning:

- `daily_items_open_node_uq` — partial unique on `(user_id, node_id)` where the row is open
  and unforwarded. A task sits on **at most one open day**, which is what makes "Plan for day"
  a single well-defined value and makes dragging a task to another day a _move_. Completed and
  forwarded rows fall out of the index, so history across many days is unconstrained.
- `daily_items_day_sort_key_uq` — same fractional-indexing idiom as nodes and notes.

**Journal needs no new table.** A daily note is a row in `notes` with `note_date = the day`
and the reserved `subject = "Journal"` (`JOURNAL_SUBJECT` in `src/lib/day/types.ts`). It gets
the existing markdown editor, nesting, search and filters for free.

## Code map (as built)

### `src/lib/day/`

| File                             | Contents                                                                                                                                                                                            |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `types.ts`                       | `DailyItemView`, `DayPayload`, `WeekPayload`, `JOURNAL_SUBJECT`                                                                                                                                     |
| `appointments.ts`                | Wall-clock day membership for the appointments pane (`localDateKey`, never `toDateKey`)                                                                                                             |
| `queries.ts`                     | `loadDay`, `loadWeek`, `plannedDayForNode`, `plannedNodeIds`, `loadJournal`                                                                                                                         |
| `mutations.ts`                   | `createDailyItem`, `updateDailyItemTitle`, `setDailyItemState`, `setDailyPriorities`, `moveDailyItemToDay`, `deleteDailyItem`, `planNodeForDay`, `promoteToTask`, `forwardOpenItems`, `saveJournal` |
| `forward.ts` + `forward.test.ts` | Pure carry-over rule                                                                                                                                                                                |
| `priority.ts`                    | Adapter binding the shared ranking engine to daily fields; `sortDayItems`                                                                                                                           |
| `mutations.integration.test.ts`  | 42 tests including the full cross-user isolation block                                                                                                                                              |

`loadDay` runs `forwardOpenItems` **only when the day requested is today**. On read rather
than on a schedule, so carry-over does not depend on the app being open at midnight.
Idempotent via `forwarded_to`.

Inside `forwardOpenItems` the transaction order matters: the old row must be marked forwarded
_before_ the new row is inserted, or the new row collides with the very row it replaces under
`daily_items_open_node_uq`.

### Shared ranking engine (refactor)

`src/lib/priority/letterRank.ts` — `letterRankEngine(read)` returns `compare`,
`itemsInLetter`, `planDrop`, `planDropOnLetter`, `planAssign`, `planClear`. Extracted from
`src/lib/chooser/tcPriority.ts`, which is now a thin adapter; `src/lib/day/priority.ts` is the
second. `src/components/grid/LetterRankCell.tsx` is the matching UI extraction, with
`TcPriorityCell` reduced to a wrapper.

**The regression gate for this refactor is that `tcPriority.test.ts` (30 tests) passes
completely untouched.** It does.

### Routes, actions, components

- `src/app/day/page.tsx` (`?date=`), `src/app/day/week/page.tsx` (`?week=`),
  `src/app/day/actions.ts` (the `run()` idiom from `src/app/notes/actions.ts`).
- `src/components/day/` — `DayView`, `DayHeader` (date nav + Day|Week toggle),
  `DailyItemsGrid`, `dayColumns.tsx`, `AppointmentsPane`, `DailyNotesPane`, `WeekPlanView`.
- Day tab added to `TABS` in `src/components/shell/TabStrip.tsx`, before Weekly Schedule.

Reused rather than rebuilt: `DataGrid` + its `rowDrag`, `MarkdownEditor` + `useAutosave`,
`loadSchedule`/`expandRecurrence` for appointments, `buildChooserItems` for the week rail,
`sortKey.between` for ordering, `ensureInbox` + `createNode` for promotion.

### Integration seams

| Seam                                                 | File                                                                                                                                               |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Plan for day** on task and task-less project forms | `src/components/detail/PlanForDayField.tsx`, wired in `TaskForm.tsx` and `ProjectForm.tsx`; `plannedDay` added read-only to `NodeDetail`           |
| Planned tasks leave the master list                  | `settings.hidePlanned` in `src/lib/chooser/types.ts`, default **on for `todo-list` only**; `plannedNodeIds` passed from `src/app/chooser/page.tsx` |
| Journal browsing                                     | Journal button in `src/components/notes/NotesGrid.tsx` toolbar, setting the existing subject filter                                                |

## Acceptance criteria (met)

- [x] Typing a line onto today creates **no** node, no Inbox row, and asks for nothing else.
- [x] Daily ABC ranks densely, groups under A/B/C/D headers (empty headers rendered, since the
      header is the drop target), and unranked lines keep typed order.
- [x] A checked line stays where it is rather than resorting the page.
- [x] Unfinished lines from earlier days appear on today; the earlier day shows **→ forwarded**.
- [x] Repeating the load does not duplicate anything.
- [x] Rows on _future_ days are never touched — planning ahead survives opening the app.
- [x] Cancelled ("Deleted") and completed lines do not carry forward.
- [x] Completing a node-backed row completes the task; for a **recurring** task the row stays
      checked while the task resets and re-defers.
- [x] Dragging a task onto a week column removes it from the Task Chooser's To-do List but
      **not** from Best Overall.
- [x] "Plan for day" on the task form round-trips to the day page and back.
- [x] Journal autosaves and appears under the Notes tab's Journal filter.
- [x] Nothing on a daily list can render as overdue — the grid has no Status column.
- [x] A second user cannot read, change or delete the first user's rows, journal included.

## Changes from original plan

| Change                                                                                                                                                                                 | Why                                                                                                                                                                                                                                                                          |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Cancel vs delete separated** in the day menu; cancelled shows as settled (strikethrough, bottom of list) with an **X** mark instead of a check; "Delete task…" hard-deletes the node | "Mark deleted" used to set `cancelled` and conflated Covey's cancel mark with actual removal. Cancel = keep on the day as not-doing-it; Remove from this day = unplan; Delete task = destroy the task.                                                                       |
| **Open task form from day view** — Enter, double-click, and menu "Open task" open `NodeDetailDrawer` for node-backed rows                                                              | Day list was a dead end for editing full task fields.                                                                                                                                                                                                                        |
| Settled lines (completed **and** cancelled) sort below open work                                                                                                                       | Lee wants cancelled to read like completed and both out of the way of still-open work. Supersedes the earlier "leave checked lines in place" Covey-paper choice for this list.                                                                                               |
| Jotted lines are their own row, not nodes; day assignment stored in `daily_items` rather than reusing `target_start_date`                                                              | Lee asked for a settable field on the task. Reusing `target_start_date` would have shifted chooser scores, broken the Achieve start/end range, and — decisively — could not carry a forwarded mark. Delivered the requirement as a **Plan for day** field backed by the row. |
| Ranking engine extracted to `src/lib/priority/letterRank.ts`; `LetterRankCell` likewise                                                                                                | The plan said "do not write a third copy". Extraction was the cheapest way to honour that, with the untouched `tcPriority.test.ts` as the gate.                                                                                                                              |
| **Plan for day** added to task-_less projects_ too, not just tasks                                                                                                                     | Found during verification: the chooser's candidate rule is "leaf tasks **and task-less projects**" (manual §8), so the week grid could plan a project the form then could not show or clear.                                                                                 |
| Forwarded rows render "→" in place of the check box, and are undraggable in the week grid                                                                                              | Found during verification: faint styling alone left a past day looking like the work was still open, which defeats the honest-record decision. A forwarded row is history — its live copy is on the day it moved to.                                                         |
| **Plan for day** commits a complete date on change, an empty one on blur                                                                                                               | Found during verification: `<input type="date">` fires change per segment, and a half-typed date reads as `""` — writing that through would delete the plan once per keystroke on the way to setting it.                                                                     |
| Moving a row to another day clears its ABC                                                                                                                                             | Ranks are dense within a day, so carrying "A1" across would leave a hole behind and collide at the destination. "Essential today" is also a judgement about _that_ day.                                                                                                      |
| Auto-forward is hardcoded on                                                                                                                                                           | There is no user-settings table, and inventing one was out of proportion. Listed as a follow-up.                                                                                                                                                                             |
| Appointments pane is a read-only list, not an hour grid                                                                                                                                | The Weekly Schedule tab owns time-block editing; a second calendar would be two places to drag to and two ways to disagree.                                                                                                                                                  |
| Day appointments file on `localDateKey(startAt)`, not `toDateKey`                                                                                                                      | Timed appointments are instants. `toDateKey` reads UTC components, so a 9pm Eastern event landed on the next day. Same membership rule as the schedule agenda.                                                                                                               |

## Verification

`npm test` — 800 tests across 49 files, with Postgres up so the 42 day integration tests
actually ran (`agent-os/standards/development/testing.md`: a green unit run does not mean the
DB tests executed). `npm run lint` and `npx tsc --noEmit` clean. `npm run build` passes in a
throwaway worktree with `/day` and `/day/week` both in the route table.

Driven end to end in a real browser (`run-planner` skill): jotted three lines, ranked them
A1/C1, checked one off and confirmed it held position; created a line on a past day and
confirmed it appeared on today while the past day showed "→"; dragged a master task onto
Tuesday and confirmed the rail went 26 → 25, the task appeared on Tuesday, the To-do List
dropped it and Best Overall kept it; set **Plan for day** from a drawer and found the item on
that day; typed a journal entry and found it under the Notes Journal filter.

Screenshots: `.artifacts/planner-shots/day-populated.png`, `day-forwarded-mark.png`,
`week-plan.png`, `task-plan-field.png`, `notes-journal-filtered.png`.

## Follow-ups (new work — not edits to this spec)

- **Big Rocks** — templates that survive being dragged onto a day, spawning an occurrence.
- **Weekly Planning wizard step** that places daily items.
- **Auto-forward toggle** — needs a user-settings table.
- **Agent API tools** for reading and writing the day list (`/api/agent/*`).
- **GTD outcome / "done when" fields** on projects and tasks, prompted during weekly planning.
- Drag directly from the Task Chooser tab onto a day (today it is the week grid or the form).
