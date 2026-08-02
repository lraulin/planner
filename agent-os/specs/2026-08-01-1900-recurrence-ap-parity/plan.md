# Achieve-parity task recurrence — date patterns beside regeneration

**Status: frozen / complete** (2026-08-01)
Spec folder: `agent-os/specs/2026-08-01-1900-recurrence-ap-parity/`
Delta on: `agent-os/specs/2026-07-31-0834-task-recurrence/` (frozen the same day)

This document is the durable record of **what was built and why**. Future work on
recurrence should open a new delta-spec rather than editing this one.

---

## Context

The ask, in Lee's words:

> Making a task repeating doesn't seem to work. I set one to repeat after one day and
> completed it; it remains completed and there is no new task. […] Let's look at how it
> works in AP and make it work like that. Regenerate is an additional option for every
> recurrence pattern in addition to regular recurrence.

Two separate problems behind that.

**A real defect.** The drawer never re-read after a save, so completing a repeating task
from it left the State select reading "Completed" while the grid behind it read "Not
Started". Pressing Save again then cycled the task a second time, because the drawer posts
its whole draft and `saveNodeDetail` ran the state transition unconditionally. Fixed first
and on its own (`50e04fb`), before any of the redesign.

**A missing half of the feature.** The first slice built only Achieve's _regeneration_
patterns and moved only `deferred_date`. The manual (§3.9) distinguishes two kinds:

> **Date recurrence patterns** follow a fixed pattern of dates, similar to a recurring
> appointment. […] the next occurrence will always be on the scheduled Friday regardless of
> when you actually finished the previous one.
>
> **Regeneration recurrence patterns** do not have fixed dates because they are calculated
> based on the date the current instance is completed.

Lee's own framing of the difference: a school report due every Friday is a _date_ pattern —
finish next week's on Wednesday and you owe nothing until the 15th; miss one and you still
owe it _and_ next week's. Brushing your teeth is _regeneration_ — however many times you do
it today, tomorrow's is still tomorrow.

Outcome: every option in Achieve's Recurrence dialog (`screenshots/recurrence/`), both modes
on every frequency, all of a task's dates moving together, and visible evidence in the
drawer that a completion did something.

## Decisions

- **Keep the cycle-one-row model.** Achieve copies the item on completion; we reset the same
  row and log to `task_completions`. Achieve also only generates the next instance _when you
  complete the current one_, so a single cycling row is behaviourally identical for both
  modes — and keeping the id keeps the node's TC Priority rank, Focus flag and planned day,
  which a fresh copy would discard every cycle. Confirmed with Lee, who was willing to
  accept duplicate rows if they made it easier; they did not.
- **The pattern anchors on the deadline if there is one, else the deferred date, else the
  target start.** "Due every Friday" should put Friday on the deadline.
- **Every already-set date shifts by the same number of days.** Which fields are _created_
  when empty follows Achieve: **target start and deferred date always are**, because the
  next occurrence exists the moment you complete this one and has to sit somewhere — its
  regenerated item comes back with both filled in and its Deadline still None. **A deadline
  is only ever advanced, never invented.** Target end and the reminder are only moved:
  creating either would invent a window or an alarm nobody asked for. The same split
  governs "Plan for day" — a day you had planned moves, a day you had not is not chosen for
  you.
- **Where a date lands, when it was already set.**
  Achieve collapses all set dates onto the new occurrence date. Shifting by a delta is the
  same thing whenever they were equal — Achieve's normal case, and what its own screenshots
  show — and strictly better when they were not: a task that starts Monday and is due Friday
  keeps its four-day window instead of losing it on the first cycle.
- **Recurrence never _creates_ a deadline; it only advances one you set.** This narrows, and
  deliberately preserves, the load-bearing rule of the frozen spec. A routine with no
  deadline still moves only its defer date and can never read Overdue. The editor must never
  seed a deadline implicitly, and nothing in the completion path writes a date field that
  was null.
- **`deferred_date` is written on every cycle**, whichever field the pattern anchored on. It
  is the only thing `isChooserCandidate` reads to hide a finished routine, so a
  deadline-anchored task without one could be ticked twice in a day — inflating the
  completion log that "end after N occurrences" is counted against. An existing defer date
  is shifted like everything else; a missing one is created.
- **A missed occurrence is not caught up.** Completing a scheduled task whose anchor is in
  the past steps forward exactly one period and may come back still overdue. That is the
  school-report case. Regeneration is the mode for habits where catching up is meaningless.
- **Three invariants live in check constraints, not just the form**, because rows also
  arrive from the agent API and from hand-run SQL: `regenerate` implies the `interval`
  pattern (a regenerating task has no stable series start for a weekday pattern to hang
  off); an ordinal is 1–4 or -1 (Achieve offers a "fifth" most months do not have); and
  every-weekday/every-weekend forces interval 1 ("every 2 weekdays" has no agreed meaning).
- **Inline editor in the Task drawer, not a modal**, per `components/ux-principles`. The
  layout diverges from Achieve's dialog — a Mode select where Achieve has a Regenerate radio
  in each tab — but every option is present.
- **Local calendar days at midnight** throughout the engine. That is what `DateField` writes
  and the only way these columns are edited by hand; carrying the time of day a task
  happened to be ticked at would make every later comparison depend on it.

### Out of scope

- Recurrence on projects (needs the columns moved from `task_details` to `nodes`)
- **Lead Time driving the new Target Start Date** from the new deadline (§3.9.5). Shifting
  every date by one delta already preserves whatever gap the task had.
- Migrating `AppointmentDrawer` onto the new editor, or the appointment expander onto the
  new engine. See "Two engines" below.
- Any UI over the completion log.

## What was built

| Piece                     | Where                                                                      |
| ------------------------- | -------------------------------------------------------------------------- |
| The pattern engine, pure  | `src/lib/recurrence/pattern.ts` (+ `.test.ts`, 29 cases)                   |
| Regeneration, unchanged   | `src/lib/recurrence/nextDue.ts`                                            |
| Shared date arithmetic    | `src/lib/dateMath.ts` — added `startOfDay`, `daysBetween`, `daysInMonth`   |
| The completion path       | `applyStateTransition` in `src/lib/tree/mutations.ts`                      |
| Eleven columns + 3 checks | `src/db/schema.ts`, `drizzle/0018_mighty_toro.sql`                         |
| The editor                | `src/components/detail/RecurrenceFields.tsx`                               |
| The repeating-row glyph   | `NameCell` in `src/components/grid/cells.tsx`                              |
| Skip Recurrence           | `skipRecurrence` in `src/lib/tree/mutations.ts`, button in the drawer      |
| Day-list sync             | `syncDayLineOnCompletion` / `reopenDayLine` in `src/lib/tree/mutations.ts` |

`recurrence_pattern` defaults to `interval`, which is exactly the old behaviour, so the
migration is pure `ADD COLUMN` with no data migration.

### Two engines, one kernel

`src/lib/schedule/recurrence.ts` (appointments) is **not** unified with this. It answers a
different question — every occurrence overlapping a window, from a fixed series start that
_is_ occurrence zero — and carries hand-tuned fast-forward plus an occurrence tally that a
real shipped bug was fixed in. This engine answers "the one date after this cursor", from an
anchor that moves on every completion. The arithmetic they share lives in `dateMath.ts` and
in `nthWeekdayOfMonth` / `nextWeekdayOnOrAfter`.

## Acceptance criteria

All verified against the running app and the real database on 2026-08-01.

- [x] Completing from the drawer leaves it showing the _new_ state and dates, not the old
      ones — checked live; the drawer read Not started / Deferred until 08/02 immediately
- [x] A second Save does not log a second completion or push the dates twice
- [x] Setting Repeats on an already-completed task does not silently cycle it
- [x] Weekly-on-Friday with deadline 08/07, defer 08/03, start 08/03: completing on 08/01
      gave deadline 08/14, defer 08/10, start 08/10 — the window preserved, and the _Friday
      after_, not the next day, because completing early buys time
- [x] `target_end_date`, left null, stayed null
- [x] A dateless daily routine still gets only a defer date and no deadline
- [x] Monthly "the last Sat" from a 08/14 anchor previewed and produced 08/29 — the fifth
      Saturday, not the fourth
- [x] Switching to regeneration reset the pattern to `interval`, satisfying the constraint;
      the preview changed to "1 month after each completion"
- [x] Ends "after a number of times" saves a count instead of leaving it null
- [x] A missed occurrence comes back still overdue rather than jumping to next week
- [x] A counted series finishes for real on its last occurrence: `completed`, `completedAt`
      set, no reset
- [x] The database refuses a regenerating task with a calendar pattern
- [x] Weekday buttons measure 44px+ on a 390px viewport
- [x] A second user cannot complete, read or delete the first user's recurring task or its
      completion rows
- [x] **Skip this occurrence** moved the deadline and defer date on a week, logged no
      completion, left `date_completed` alone and left an in-progress subtask alone
- [x] **A daily task checked off on the Day page** stayed crossed off there and appeared
      open on tomorrow's page, carrying its A ranking — two `daily_items` rows, one
      completed and one open
- [x] Completing the **same task from the Tasks grid** did exactly the same thing — today's
      line checked and struck through, tomorrow's open, the B ranking carried
- [x] A plain task completed in the outline has its day line checked off too
- [x] A task **never planned for a day**, completed from the Tasks grid, appears on today's
      page struck through — and does not appear in the drawer's "Plan for day", which reads
      open lines only
- [x] Reopening a task the same day un-checks its day line; a cycled routine's completed
      line is left alone, because that occurrence really was done
- [x] The whole checklist under a repeating task comes back Not Started, whatever state
      each step was left in
- [x] `test:unit`, `test:integration`, `typecheck`, `lint`, `build` all pass (1097 tests)

## Changes from the original plan

| #   | Change                                                                                                                                                                                                                                              | Why                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | The reported bug was **real**, not only an invisibility problem. The plan hedged that all three completion paths might work.                                                                                                                        | The drawer's missing re-read plus the unconditional state transition are a genuine defect, and the second half corrupts the completion log. Fixed in its own commit first.                                                                                                                                                                                                                                                                                                                                          |
| 2   | **`deferred_date` is shifted when set, created when not** — the plan said "always set to `next`".                                                                                                                                                   | A defer date a few days before a deadline is a deliberate head start; overwriting it with the deadline would delete that lead every cycle.                                                                                                                                                                                                                                                                                                                                                                          |
| 3   | **`recurrenceInterval` was dropped from `OutlineRow`**, and the new pattern columns were never added to it.                                                                                                                                         | They are loaded for every row on every outline render and read by nothing — `TaskForm` reads `detail.task`. Only `recurrenceFrequency` earns its place, for the glyph.                                                                                                                                                                                                                                                                                                                                              |
| 4   | **A missing `recurrence_count` means "no end", not "end now"** — and the editor seeds the count when the condition is chosen.                                                                                                                       | `?? 1` would have finished the task on its very first completion. Found by driving the real UI, not by a test.                                                                                                                                                                                                                                                                                                                                                                                                      |
| 5   | **The `useToday` / `isDeferred` UTC-vs-local split was left alone.**                                                                                                                                                                                | It is pre-existing and pervasive — `DateField`, every grid column and `status.ts` all render UTC day keys — and it happens to agree with local days in Lee's timezone. Rewriting the convention is a separate change with a much wider blast radius. See Follow-ups.                                                                                                                                                                                                                                                |
| 6   | **The whole subtree resets to Not Started**, reversing the frozen spec's "only completed children come back".                                                                                                                                       | Lee's call, and the manual's: subtasks under a repeating task are the steps for doing it — get the keys, unlock the shed, fill the mower — and none carry over to next week's mow. A cancelled step meant "not needed that time"; a step that never belongs is deleted instead. An in-progress step cannot be half-done on an instance that has not started, or the task would not have needed to recur.                                                                                                            |
| 7   | **Skip Recurrence and the Day-list sync were added**, both out of scope when the plan was written.                                                                                                                                                  | Both turned out small once the engine existed, and both were asked for. Skip shares `nextAnchor` with the completion path rather than reimplementing the rule.                                                                                                                                                                                                                                                                                                                                                      |
| 8   | **The day line follows a completion from every surface, and for every task** — not only when the task was ticked on the day page, and not only for repeating ones.                                                                                  | The first cut synced only the day page's own path, on the grounds that a second open line would collide with the one-open-day-per-task index. Lee: "Seems like completing a task should have the same effects regardless of which view you're in when completing it." Right — and completing the open line first is what makes room for the next one, so the index objection dissolves. Reopening a task the same day un-checks it again, narrowly: only today's line, and only when no open line exists elsewhere. |
| 9   | **The day page records every completion, planned or not** — a task completed anywhere gets a struck-through line on that day even if it was never on the list. But the **next occurrence is only planned when the task was already on a day list**. | Lee: "the FC Day view does serve as a record of that day, just as it would if it was an actual page in a paper planner […] you should see a crossed out line for every task that was completed on that day." A record with holes is not a record. The second half is the counterweight: "Plan for day" is the user's statement of intent, and recording that you did something today is not grounds for the app to decide you mean to do it again on Thursday.                                                      |
| 10  | **Target start is created when empty**, not only shifted — and `nextDue` now returns local midnight like `nextOccurrence`.                                                                                                                          | Lee: "It does set start date and deferred date even if they weren't set before, as since the task is created instantly, obviously some date is necessary." The midnight change is not tidiness: these dates are compared as **UTC** calendar days by `isDeferred` and `useToday`, so a routine finished at 20:00 Eastern carried a defer date whose UTC day was the day _after_ it was due and stayed hidden through most of it.                                                                                    |

## Follow-ups (new work — not amendments to this spec)

- **Lead Time → Target Start** (§3.9.5).
- **Skip on the grids.** Skip Recurrence is a drawer button; it has no context-menu or
  keyboard path yet.
- **Standard (date-pattern) recurrence may not earn its keep.** Lee's own read after
  building it: "if they really are separate independent assignments, you'd probably want to
  create actual separate tasks for them […] it seems I have much less use for it than
  regenerate after completion." Revisit only if daily use turns up a need.
- **A shared `RecurrenceFields` for appointments**, which would need their schema widened.
- **The UTC/local day-key convention**, one decision applied everywhere at once.
- **Recurrence on projects.**
- **A completion log view.** The one surface the model is missing. `task_completions` holds
  every completion of every repeating task and nothing reads it; the day page answers "what
  did I do on Tuesday" but not "how consistently have I brushed my teeth". Lee's sketch: a
  dedicated view, with the option to filter to repeating tasks' completions so it is a
  habit record rather than a wall of everything.
- **Day-page noise from bulk completion.** Clearing twenty tasks out of the outline now
  writes twenty struck-through lines onto today. Correct as a record, possibly tiresome as
  a page. If it becomes so, the fix is a filter on the day page, not a hole in the record.
