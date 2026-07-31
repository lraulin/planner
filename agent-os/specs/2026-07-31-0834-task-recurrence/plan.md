# Repeating routine tasks (deferral-based recurrence)

**Status: active**
Spec folder: `agent-os/specs/2026-07-31-0834-task-recurrence/`

## Context

Achieve Planner supports **regeneration-based recurrence** (manual §3.9.1): "regenerate new
item N week(s) after each instance is completed." We have never implemented it. Recurrence
in this repo exists only on **appointments** (`appointments.recurrence_*`, expanded at read
time by `src/lib/schedule/recurrence.ts`); `nodes` have none, `project_details`'s doc comment
says recurrence is out of scope, and `agent-os/product/roadmap.md` files Achieve recurrence
under _Out of roadmap (for now)_.

The problem this solves is **signal integrity on Overdue**. A deadline is a real external
constraint — taxes, voting, bills. "Play with my cats every day" and "change the pool filter
roughly every two weeks" are not deadlines; nothing breaks at day 15 or 18. Modelling
routines as deadlined tasks floods Overdue with things that were never urgent, and once
Overdue is mostly noise it stops being read at all.

> **"Should be done ASAP" ≠ "has a deadline."** This is the load-bearing idea of the whole
> feature, and the thing a future reader is most likely to "fix" by helpfully adding a
> deadline. Don't.

So a repeating routine must be able to exist with **no deadline at all**: it appears in the
Task Chooser, you complete it, and it stays out of the Chooser until it is due again.

Outcome: tick "Play with cats", it vanishes from the Chooser until tomorrow, reappears, and
a record of each completion is kept — without leaving 365 completed duplicate rows in the
outline per year.

## Decisions

Confirmed during shaping:

- **Reset in place + completion log**, not AP's regenerate-a-copy. One row cycles forever;
  each completion appends to `task_completions`. AP's behaviour would leave ~365 completed
  duplicates a year in the outline for a daily routine, and each new instance would carry a
  new id — silently losing the node's hand-ranked **TC Priority** position and its Focus
  flag every cycle. Reset in place keeps the id, so both survive.
- **Recurrence never sets a deadline.** It drives `deferred_date` only. See Context.
- **The whole subtree un-completes** on each cycle (AP §3.9: children "initialized to the Not
  Started state"), so a repeating checklist works on its second run.
- **No staleness escalation.** A routine past its defer date simply becomes available again
  and competes on its normal score. It never becomes Overdue and never adds deadline
  pressure. (The pool filter arguably _should_ nag at day 25; that is a follow-up, and it
  must not be built out of the deadline machinery.)
- **Tasks only.** Projects are excluded — reshaping project fields is not justified by this
  feature alone. `deferred_date` already lives on `task_details`, so tasks-only is also the
  cheaper seam.
- **Date-driven, not state-driven.** Availability is derived from `deferred_date > today` at
  read time. Parking the node in the `postponed` state instead would need a cron job to flip
  it back to `not_started`; the derived rule is pure, testable, and needs no scheduler.
- **Reuse two existing columns rather than adding new ones.** `task_details.deferred_date`
  already exists, is already editable in `TaskForm`, and is currently **inert** — nothing
  reads it. This slice is what makes it real. `task_details.date_completed` already means
  "Date completed" and becomes "last completed" for a recurring task.
- **Inline form fields, not an AP-style "Set Recurrence" dialog.**
  `components/ux-principles` permits modals only for destructive confirmations, blocking
  decisions, and fast capture. This is routine editing bound to a record.

### Out of scope

- Recurrence on projects (needs defer/recurrence moved from `task_details` to `nodes`)
- AP's **date-based** patterns (fixed daily/weekly/monthly/yearly calendar deadlines) — a
  different computation, and one that reintroduces deadlines
- End conditions (never / after N / until) — the `recurrence_end` enum is ready when wanted;
  a routine repeating forever is the correct default
- Skip Recurrence (AP §3.9.4)
- Lead-time → target-start initialisation (AP §3.9.5)
- Any UI over the completion log (streaks, "last done", habit consistency)

## Acceptance criteria

All verified in the running app on 2026-07-31, against the real database.

- [x] A task with **no deadline** can be set to repeat every N days/weeks/months/years —
      Repeats/Every render on the Task drawer's General tab and persist across a reload
- [x] Completing it from any surface resets it to Not Started and pushes `deferred_date` to
      now + interval — checked from the Task Chooser (`setState`) and the outline grid, and
      covered for the drawer (`saveNodeDetail`) by integration test
- [x] It disappears from the Task Chooser until that date, then reappears — completing
      "Water the plants" took the list from 27 rows to 26; backdating the defer date by one
      day brought it back at 27
- [x] Its Status column reads **Deferred** while it waits, and never **Overdue** — the
      returned task reads **On Schedule**, not Overdue, because it has no deadline to be
      late against
- [x] Descendants un-complete, and their actual effort / % complete reset — a "Pool
      maintenance" task with two completed children came back with all three Not Started
- [x] One `task_completions` row is written per completion
- [x] A non-recurring task still just completes (regression)
- [x] A second user cannot complete, read, or delete the first user's recurring task or its
      completion log
- [x] `test:unit` (523), `test:integration` (226, no skip warning), `typecheck`, `lint`,
      `build` all pass

**The behaviour the feature rests on, checked live:** after completing the daily task, the
database read back `state: not_started`, `completedAt: null`, **`deadline: null`**,
`deferredUntil: 2026-08-01`, `lastCompleted: 2026-07-31`, `percentComplete: 0`,
`completionRows: 1`.

## Changes from original plan

| #   | Change                                                                                                                                                   | Why                                                                                                                                                                                                                                                                                                                                                |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Only completed descendants are un-completed.** Cancelled and in-progress children are left as they are; the plan said "un-complete the whole subtree". | Achieve §3.9.4 is specific that it is the _completed_ child items that come back ("the completed child items … will not be 'uncompleted' like they are when a new instance is generated"). Resetting the others would resurrect work deliberately cancelled, or silently discard progress on work under way.                                       |
| 2   | **One `scheduleStatus` call site changed, not four.** Only `StatusCell` (`grid/cells.tsx`) passes the new `deferredUntil`.                               | The other three are `filterValue` / `sortValue` callbacks that deliberately pass `today: null`, so they cannot distinguish _any_ date-derived status — an overdue row already reports "On Schedule" there. Passing the extra argument would have been dead code. The enum filter's blindness to date-derived status is pre-existing and unchanged. |
| 3   | **`applyStateTransition` also clears `completedAt` on the way out of `completed`**, which the plan did not spell out.                                    | `saveNodeDetail` previously did this inline and the helper had to keep it, or reopening a completed task from the drawer would leave a stale timestamp and the outline would keep colouring the row as done. Covered by a test.                                                                                                                    |
| 4   | **The recurrence reset runs last inside `saveNodeDetail`**, after the side-table write.                                                                  | The drawer posts its whole draft at once, so a save carrying both `state: completed` and `percentComplete: 100` would otherwise overwrite the reset and the task would come back already finished. Covered by a test.                                                                                                                              |
| 5   | **`date_completed` is reused as "last completed"** rather than adding a `last_completed_at` column, as an unstated simplification of the plan's schema.  | The column already exists, already means exactly that, and is already on the form. `task_completions` remains the authoritative history.                                                                                                                                                                                                           |

---

## Task 1: Save spec documentation

This folder. Standards pulled into `standards.md`: `database/migrations`,
`development/testing`, `components/ux-principles`, `components/drawer-pattern`.

## Task 2: Schema and migration

`src/db/schema.ts` — two columns on `task_details`, reusing the **existing**
`recurrence_frequency` enum as the unit, so the migration is pure `ADD COLUMN` with no
`CREATE TYPE`:

- `recurrence_frequency` — `none` (default, = not recurring) / `daily` / `weekly` /
  `monthly` / `yearly`
- `recurrence_interval` — integer, notNull, default 1

Read as "every {interval} {frequency}, measured from each completion". Anchoring to the
completion rather than to the previous due date is the point: finish the filter on day 18 and
the next one is due 14 days from _then_, with no accumulating debt.

New table `task_completions`: `id`, `userId` (FK cascade), `nodeId` (FK cascade),
`completedAt`, `createdAt`, indexed on `(userId, nodeId, completedAt)`. Nothing surfaces it
in this slice — it is written now so the history exists when a UI wants it.

Then `npm run db:generate`, **read the generated SQL**, `npm run db:migrate`. Commit the
`.sql`, the snapshot, and the `_journal.json` entry together (`database/migrations`).

Also update the stale "Recurrence … out of scope" comment on `project_details`.

## Task 3: The date engine

`addDays` / `addMonths` / `addYears` already exist in `src/lib/schedule/recurrence.ts` but
are module-private — including the end-of-month clamp that makes Jan 31 + 1 month land on
Feb 28/29. **Extract them to `src/lib/dateMath.ts`** and import from both, so the DST and
clamping behaviour stays single-sourced under its existing test coverage. Do not
re-implement.

New `src/lib/recurrence/nextDue.ts` (+ `.test.ts`), pure, no I/O:

- `nextDue(completedAt, frequency, interval): Date | null`
- `isDeferred(deferredDate, today): boolean` — `today` as `YYYY-MM-DD`, the convention
  `src/lib/tree/status.ts` and `src/lib/chooser/dates.ts` already use

Tests that would fail on a plausible mistake: interval stepping; end-of-month clamp; Feb 29
in a common year; local wall-clock preserved across a DST spring-forward; and the boundary
that matters most — a defer date of **today** is available, not deferred.

## Task 4: The completion path

There are exactly **two** server-side writers of node state, and both already special-case
completion:

- `src/lib/tree/mutations.ts` `setState` — every grid, the outline, and the Task Chooser
  funnel here via `setStateAction`
- `src/lib/detail/mutations.ts` `saveNodeDetail` — the drawer's State dropdown, which does
  **not** go through `setState`

Extract a shared `applyStateTransition(tx, userId, nodeId, state)` in `tree/mutations.ts` and
call it from both. Non-recurring behaviour is unchanged. For a task whose
`recurrence_frequency !== "none"` being set to `completed`, in one transaction:

1. Insert a `task_completions` row.
2. Set `deferred_date = nextDue(now, …)` and `date_completed = now` on that node's
   `task_details`.
3. Reset the node **and every descendant** to `state = "not_started"`, `completed_at = null`;
   and on their `task_details`, `actual_effort_minutes = 0`, `percent_complete = 0`,
   `date_completed = null`, `actual_start_date = null`,
   `effort_left_minutes = effort_minutes` (the recurring node keeps the `date_completed`
   from step 2).

Net effect: ticking a recurring task un-ticks it and pushes its defer date out. In the
Chooser that reads as "it disappeared", which is the correct feedback; in the outline the
row's Status flips to **Deferred**, which is why Task 6 is not optional polish.

## Task 5: Plumb the fields through

- `src/lib/tree/queries.ts` — add `td.deferred_date`, `td.recurrence_frequency`,
  `td.recurrence_interval` to `loadOutline`'s outer SELECT and row mapper. The recursive CTE
  arms need no change: these come off the `task_details` join, not off `nodes`.
- `src/lib/tree/types.ts` — three fields on `OutlineRow`. `derive.ts` spreads, so
  `OutlineNode` gets them free.
- `src/lib/tree/fixtures.ts` — lists every `OutlineRow` field explicitly by design;
  TypeScript fails here until defaults are added.
- `src/lib/detail/queries.ts` + `TASK_KEYS` in `src/lib/detail/mutations.ts` — so the drawer
  can load and save the two new columns.

## Task 6: Deferred status and Chooser filtering

- `src/lib/tree/status.ts` — add `deferred` to `ScheduleStatus` and a `deferredUntil` param
  to `scheduleStatus()`. Returns `"deferred"` when that date is in the future and the row is
  not completed/cancelled. It **never** escalates: once the date passes, the row is just
  `on_schedule` again. Four call sites pass the new argument.
- `src/lib/chooser/views.ts` — `isChooserCandidate` drops candidates where
  `isDeferred(node.deferredDate, today)`. The chooser is already pure with `today` passed in.
  This also makes a _manually_ set defer date work for the first time, which is the field's
  plain meaning.

Deferred tasks stay visible in the outline and the Tasks tab — only the Chooser filters them.
Otherwise a routine becomes uneditable the moment it defers.

## Task 7: The form

A new `<Section title="Recurrence">` on **TaskForm's General tab**, immediately after the
`Dates` section — next to Deferred until, which is what it drives. Two fields from the
existing vocabulary in `src/components/detail/fields.tsx`: a `SelectField` "Repeats"
(Never / Daily / Weekly / Monthly / Yearly) and a `NumberField` "Every", shown only when
Repeats ≠ Never. Both bind via `patchTask({ … })` and ride the existing
`saveNodeDetailAction` — **no new server action**.

`AppointmentDrawer` hand-rolls its recurrence controls rather than using `fields.tsx`; do not
copy that. Extracting a shared `RecurrenceFields` is explicitly not in scope — appointment
recurrence expands occurrences on a calendar, this defers a single row, and the two only
superficially resemble each other.

Per `development/testing`: no React component tests.

## Task 8: Test and verify

**Integration** (`src/lib/tree/mutations.integration.test.ts`): completing a recurring task
resets it, writes exactly one completion row, and sets `deferred_date`; descendants
un-complete and their effort/percent reset; a non-recurring task still just completes; and
the **drawer path** (`saveNodeDetail` with `state: "completed"`) does the same thing as
`setState` — the case most likely to be missed. Plus two-user isolation on both the node and
its completion rows.

**Verification**, end to end:

```sh
npm run db:up && npm run db:generate && npm run db:migrate
npm run test:unit && npm run test:integration    # check for the Postgres skip warning
npm run typecheck && npm run lint && npm run build
```

Then drive the real app with the **run-planner** skill: create a task with no deadline, set
Repeats = Daily / Every 1, confirm it appears in the Task Chooser; complete it from the
Chooser and confirm it disappears; confirm the outline row shows Status **Deferred**, is
still Not Started, and carries tomorrow's defer date; confirm nothing anywhere reads Overdue.
Then set a task to Weekly / Every 2 with a two-item checklist beneath it, tick the children
and the parent, and confirm the children come back un-ticked.

Finally: update `agent-os/product/roadmap.md`, which currently lists Achieve recurrence as
out of scope.

## Follow-ups (new work — not amendments to this spec)

- **Recurrence on projects.** Needs defer/recurrence moved from `task_details` to `nodes`.
- **A staleness signal that is not Overdue.** The pool filter at day 25 should probably rise;
  the cats never should. Likely a per-task opt-in and a score term, deliberately built out of
  something other than the deadline machinery.
- **End conditions** (never / after N / until) — the `recurrence_end` enum is ready.
- **Skip this occurrence** (AP §3.9.4) — push the defer date without marking it done.
- **A surface for the completion log**: streaks, "last done", habit consistency.
