# Shaping — Achieve-parity task recurrence

**Status: frozen / complete** (2026-08-01)

## The ask

> Making a task repeating doesn't seem to work. I set one to repeat after one day and
> completed it; it remains completed and there is no new task.
>
> Let's look at how it works in AP and make it work like that. Regenerate is an additional
> option for every recurrence pattern in addition to regular recurrence. […] So both
> recurrence and regeneration increment the start date and the deferred date (and also the
> deadline if there is a deadline set), the difference is that regenerate will only create
> it a given amount of time in the future whereas normal recurrence will continue to
> increment every time you complete it.

With the two worked examples that decided the design:

> So recurrence I suppose is for things that are similar to appointments. Maybe more
> task-like example would be if you have a school report due every Friday. It's due this
> Friday, say on the 1st, and the next Friday (8th), and the next (15th), etc… After you
> completed the report for the upcoming Friday, you could complete next week's report even
> if it's still Wednesday, and then you wouldn't have a report due until the 15th. If you
> miss a deadline for a report, you still have to do it, and you still also have to do next
> week's report.
>
> Regeneration is for a task like brushing your teeth. You have to do it every (1) day. You
> complete it today, and then you'll have to do it tomorrow. No matter how many extra times
> you brush your teeth, you still have to brush your teeth tomorrow. Or mowing the lawn.
> Whenever I do it (day 0) I'll have to do it again 7 days later. If I do it tomorrow (day
> 1), now I have to do it again on day 8.

And, on the row model:

> I liked the idea of handling recurrence without creating multiple item instances, but if
> that is an impediment to getting this to work, we don't have to worry about that for now.
> It's fine to create extra tasks with recurrence if it's easier to do it that way.

Screenshots of Achieve's dialog, all four tabs plus the regenerating item's General tab:
`screenshots/recurrence/`.

## What was actually wrong

Two things, and separating them mattered.

The **defect** was in the drawer, not in the recurrence code. `save()` never re-read the
record, and its draft is seeded once behind a `key` that does not change — so the State
select kept saying "Completed" after the server had reset the row. And because the drawer
posts its whole draft, `state` rode along on every save and `saveNodeDetail` ran the
transition unconditionally, so a second Save cycled the task again. Fixed and committed on
its own before anything else.

The **gap** was that only half of Achieve's model existed: regeneration, at whole-unit
intervals, moving `deferred_date` and nothing else.

## Questions asked, and what Lee chose

| Question                                                  | Answer                                                                                                                                                                                                                                                                 |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cycle one row, or create a new task row per occurrence?   | **Cycle the same row.** Achieve only generates the next instance on completion too, so it is behaviourally identical, and the id carries TC Priority, Focus and the planned day.                                                                                       |
| Which date does the pattern land on when several are set? | **Deadline, else defer, else target start.** With the note: "In AP, after recurrence or regeneration, all the dates are the same, except it doesn't get a date set for a field that wasn't set before. I don't see a reason to change, but…whatever makes most sense." |
| How much of the dialog?                                   | **"I want all the same options."** Including ordinals and the Range box.                                                                                                                                                                                               |
| Where does the editor live?                               | **Inline in the drawer**, not a modal. "Doesn't have to be the same exact UI if we can think of a better."                                                                                                                                                             |

That second answer is why the dates shift by a delta rather than collapsing onto one date
the way Achieve does: when the dates were all equal — Achieve's normal case, and what its
screenshots show — the two are identical, and when they were not, the delta keeps a
start-to-deadline window that Achieve would destroy.

## The shape

One rule on `task_details`: a frequency, an interval, a **mode** (`scheduled` /
`regenerate`) and a **pattern** (`interval` / `weekday` / `weekend` / `by_weekday` /
`by_month_day` / `by_ordinal`) plus the fields each pattern needs, and an end condition.
Frequency × pattern covers Achieve's four tabs exactly, and `interval` — the default — is
what the feature already did, so no existing row changes meaning.

On completion, one function decides where the anchor moves to:

- `scheduled` → `nextOccurrence(rule, anchor)`, measured from this occurrence's own date
- `regenerate` → `nextDue(completedAt, …)`, measured from the completion

Then every date the task already had shifts by that many days. Nothing that was null is
written, which is what keeps a deadline-free routine deadline-free — the reason the whole
feature exists, unchanged from the first slice.

## Added after first use

Three things Lee asked for once the core was working, all following from the same reading
of what a repeating task _is_:

- **The whole checklist resets.** Subtasks under a repeating task are the steps for doing
  it, not progress through one instance of it. "Regardless of what I did last week, I'm
  going to have to do all that again to mow the lawn next week." Cancelled steps come back
  because cancelling one meant "not needed that time" — a step that never belongs on the
  list gets deleted. In-progress ones come back because "if progress did carry over, it
  wouldn't recur — after completing it, it would stay completed."
- **Skip Recurrence** (§3.9.4): move on without doing this one. Nothing logged, nothing
  reset, no count spent.
- **The Day page carries it forward.** "On completion a daily task should then appear in
  the next day uncompleted, but still appear completed/crossed off in the current day."
  Only when it was checked off _on a day page_, and only when no open line for it exists —
  the one-open-day-per-task index would refuse a second.

## Risks accepted

- **A missed occurrence steps on by one period and can come back overdue.** That is Lee's
  stated intent for date patterns, and it is why regeneration exists for habits.
- **A repeating task can now be Overdue** — but only one whose deadline the user set. The
  Chooser's `deadlineOverdue: 400` term makes that expensive, so the "never creates a
  deadline" rule is enforced in the completion path and in the editor, not just stated.
- **`deferred` still masks `overdue` in `scheduleStatus`.** A scheduled task that is past
  its deadline and still deferred reads Deferred. Correct here, and unchanged.
- **Date patterns may see little use.** Lee, reasoning it through after the fact: the
  trigger for the next occurrence is completing the previous one either way, so a missed
  report and this week's are never both on screen — "if they really are separate
  independent assignments, you'd probably want to create actual separate tasks for them
  […] it seems I have much less use for it than regenerate after completion." Built as
  asked, and worth revisiting only if daily use turns up a need.
