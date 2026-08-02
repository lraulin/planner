# Target start date is the day plan

**Status: frozen / complete** (2026-08-01)
Spec folder: `agent-os/specs/2026-08-01-2030-start-date-is-the-plan/`
Delta on: `agent-os/specs/2026-07-31-1245-day-tab/` (its "day assignment" decision is
revised, with a pointer left in place)

---

## Context

The Day tab stored "I intend to do this on X" as a `daily_items` row, deliberately _not_ as
`task_details.target_start_date`. Lee asked why, having read Achieve's own definition:

> The Target Start Date for a task represents when you intend to begin working on that
> specific item. […] You can manually set a target start date in the future to indicate that
> you do not intend to start a project or task immediately.
>
> It sounds like the intended use and meaning of start date in AP is exactly the same
> concept as planned date, and it seems entirely reasonable and appropriate and desirable
> that if I set the start for a task to a certain day, then it should appear in Daily View on
> that day.

The day-tab spec gave three reasons. Two do not survive:

- **"It feeds the chooser score."** The term is `targetStartReached: 10`, on a scale where an
  overdue deadline is 400, and every weight is already editable per view. Lee: "I'm not
  overly concerned with that, as I usually preferred to use the Todo List view with manually
  assigned TC Priority anyway… And even if it did, surely it could be tweaked."
- **"It pairs with target_end as a scheduling range."** Achieve's own meaning of the field is
  the plan, and recurrence already rewrites it on every cycle.

The third stands, and is why `daily_items` still exists: **a column cannot carry a forwarded
mark**, so Wednesday could never show what became of Wednesday. The recurrence work added a
stronger version — a column cannot carry a _crossed-off line_ either, because it advances
when the task recurs, so Tuesday would lose the record entirely.

The mistake was the conclusion drawn from that. We needed "the **record** lives in
`daily_items`" and instead concluded "the day page is driven by `daily_items` only". Those
are different, and the second is what stopped a start date putting a task on a day.

## Decisions

- **One source of truth for _which day_: `target_start_date`.** A task with one has exactly
  one open day line, on that date. A task without one has none. Maintained in
  `src/lib/day/sync.ts` and nowhere else.
- **`daily_items` keeps what a column cannot hold**: the forwarded mark, the line crossed off
  on the day you did it (which outlives the task recurring and moving on), the per-day ABC
  rank, and lines jotted onto a day with no task behind them at all.
- **"Plan for day" and "Target start" are one field on the Task form.** The separate Plan for
  day control is gone from `TaskForm` — two controls writing one column would have fought,
  since one saved on Save and the other immediately. Target start carries the hint. The
  **Project** form keeps `PlanForDayField`: `target_start_date` lives on `task_details` and
  projects have no equivalent, so a planned project keeps its row as its only home.
- **A start date you sail past is carried forward, not flagged.** The plan was to add
  Achieve's "Behind Schedule". It turned out to be unnecessary: `forwardOpenItems` already
  moves an unfinished line to today and leaves "→" behind, and it now bumps
  `target_start_date` with it. A task you meant to begin on Tuesday is in front of you on
  Thursday rather than stranded on Tuesday's page, and the two never disagree.
- **A day-page gesture sets both ends of the range to that day.** Putting something on a
  daily list means "I intend to start _and finish_ this on this day"; work that genuinely
  spans days is a project, or at least a task with subtasks. Applies to planning, dragging
  between days, carrying forward, and promoting a jotted line — but **not** to editing the
  date on the record, where typing a start date is a finer act than dropping a card on a
  square and overwriting a deliberate target end would be presumptuous.
- **Tasks only on a day list.** Projects are refused, the Plan for day field is gone from
  the Project form, and the week rail filters to tasks — the chooser's To-do List still
  offers task-less projects as choosable work, but a day page holds what fits in a day. A
  project that belongs on one should have a task under it saying what you are doing.
- **Nothing plants a repeating task's next line any more.** Completing one writes a fresh
  `target_start_date` and the sync does the rest — one mechanism deciding which day a task
  sits on rather than two aiming at the same square.

### Consequences accepted

- **Every task with a target start date now occupies a day line.** That is the feature. It
  does mean a start date set for scheduling reasons rather than day-planning reasons now
  shows up on the day page.
- **The Task Chooser hides more.** `plannedNodeIds` hides anything sitting on an open day,
  so a task with any target start date is now "already planned" and drops out of the
  chooser. Coherent — it is scheduled — but it is a wider filter than before.

## What was built

| Piece                           | Where                                                                                             |
| ------------------------------- | ------------------------------------------------------------------------------------------------- |
| The invariant, in one place     | `src/lib/day/sync.ts` — `syncDayLineToTargetStart`, `setTargetStartDay`                           |
| Day gestures write both dates   | `setDayPlan` in `sync.ts`; `planNodeForDay`, `moveItemToDay`, `forwardOpenItems`, `promoteToTask` |
| Dragging a day carries the date | `moveItemToDay`, `forwardOpenItems`, `promoteToTask`                                              |
| Saving the record re-syncs      | `saveNodeDetail` in `src/lib/detail/mutations.ts`                                                 |
| Reopening re-plans for today    | `reopenDayLine` in `src/lib/tree/mutations.ts`                                                    |
| One field on the form           | `TaskForm`; `DateField` gained a `hint`                                                           |

## Acceptance criteria

Verified against the running app and the real database on 2026-08-01.

- [x] Setting **Target start** to a date in the drawer puts the task on that day's list —
      checked live, and the day page two days out shows it
- [x] Changing the date moves the line; clearing it removes the line
- [x] Dragging a line to another day moves `target_start_date` with it, so the drawer does
      not go on claiming the old day
- [x] A start date three days in the past carries forward to today: the original day keeps
      the row with `forwarded_to` set, a new open row exists on today, and
      `target_start_date` reads today
- [x] Completing a repeating task puts its next line on the new start date, with no planted
      row involved
- [x] A completed task still gets its crossed-off record on the day it was completed
- [x] Dragging a task onto Thursday in the week grid set target **start and end** to that
      day — checked live
- [x] A project is refused from a day list, and the week rail no longer offers the 11
      task-less projects it used to
- [x] Editing the dates on the record leaves a deliberately different target end alone
- [x] `test:unit`, `test:integration`, `typecheck`, `lint`, `build` all pass (1107 tests)

## Follow-ups

- **`plannedDayForNode` still reads the row, not the column.** Equivalent under the
  invariant, and the row remains the authority on whether a line exists at all.
- **Day-page volume.** Between this and "every completion is recorded", the day page now sees
  a lot of traffic. If it becomes noisy, the fix is a filter on the page.
- **Lead Time → Target Start** (Achieve §3.9.5) is still not implemented, and would now write
  the day plan as a side effect of setting a deadline. Worth thinking about before building.
