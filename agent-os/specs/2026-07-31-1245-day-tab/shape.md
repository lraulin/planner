# Shaping — The Day tab

**Status: active**

## The ask

> I want to have the OPTION to use the system like Franklin Covey's PlanPlus. I want it to be
> integrated with our existing system in a coherent way, without forcing us to use it or
> disrupt our ability to do things the intended Effexis Achieve way.

And, on what this spec is really for:

> Main intention being I want the option to work Franklin-Covey style, in a way that is
> harmonious with the system (not building a separate alternate task management system), but
> also not having to manipulate AP conventions in ways they weren't intended to achieve it
> (like in the past I created a Today Project so I could have a daily ABC task list).

That last parenthesis is the whole spec in one sentence. The **Today Project** was a
workaround: a project that was not a project, holding tasks that were not really its tasks,
whose ABC priorities meant something different from every other ABC priority in the app,
existing only because there was nowhere else to put "what am I doing today". It worked, and
it quietly corrupted the meaning of three separate Achieve concepts to do it.

So there are two failure modes to avoid, and they pull in opposite directions:

1. **A second, parallel task system.** A Day tab with its own tasks, disconnected from the
   outline, where work goes to be forgotten. Then there are two answers to "what am I
   supposed to be doing" and neither is trustworthy.
2. **Another Today Project.** Expressing the daily list by bending fields that mean something
   else — a magic project, a `targetStartDate` pressed into service, a deadline that is not a
   deadline. It fits without changing anything, and it costs you the meaning of the field you
   borrowed.

The way between them: **a real concept, with its own storage, wired into the existing one at
every seam a user would reach for.**

## Why Achieve alone was not enough

Achieve's model is strong at the altitude it was designed for — Result Areas → Goals →
Projects → Tasks, priorities relative to siblings, project blocks on a time chart, a weekly
planning wizard. That is _weekly_ thinking, and it is the right shape for it.

What it lacks is the daily habit Lee actually found most valuable in PlanPlus:

> The most useful aspect of the daily view is the ability to just jot down and add what I'm
> going to do today, prioritize it, and then check it off as I go, without wasting time
> thinking, what result area is this, what project is it a part of…. That stuff is relevant
> when I'm doing my weekly higher-level planning… But day to day, the most useful productivity
> habit is just writing down: what am I going to do today? Then prioritize it, then do it.

The Task Chooser's To-do List view, with hand-maintained TC Priority, already gives us
Covey's **Master Task List** — one flat ranking across everything available. What was missing
is the _Daily_ list beside it, which answers a different question. The master list asks "what
matters most overall". The daily list asks "what is **essential** today (A), what is
**important** (B), what is **optional** (C)". A task can honestly be a B on the master list
and an A1 today; that is not a contradiction, it is two different judgements, and it is why
they are two different fields rather than one borrowed one.

## The load-bearing rule

**A day assignment is not a deadline.** Nothing on a daily list can ever be overdue.

This is the same line the recurrence spec drew with `deferredDate`
(`agent-os/specs/2026-07-31-0834-task-recurrence/`): _should be done ASAP ≠ has a deadline_.
Deciding to do something Wednesday is a statement of intent. If Wednesday passes, the item
carries forward — it does not turn red, it does not degrade the overdue signal, nothing
explodes. The Day grid has no Status column at all, so there is nowhere for "overdue" to
even render.

The corollary, in Lee's words:

> Nothing should just automatically appear in the daily list unless I put it there.

No scoring, no suggestions, no auto-population from the chooser. The single exception is
carry-over, and it is not an exception at heart: you already put those rows on a day, and
forwarding is that decision persisting.

## Scope

### In scope (as shipped)

- **`/day`** — the paper day page: Appointments | Daily Task List | Daily Notes.
- **Jotted lines.** Type at the bottom, press Enter, the line exists. No parent, no result
  area, no effort estimate, nothing to triage. This is the point of the tab.
- **Daily ABC** — the day's own A/B/C/D ranking with dense ranks, drag-to-rank and typed
  entry, grouped under letter headers.
- **Pulling tasks in** — from the week grid, or by setting **Plan for day** on the task
  itself. Completing one completes the real task, recurrence and all.
- **Carry-over** with Covey's **forwarded (→)** mark on the day it left.
- **`/day/week`** — master task list plus seven day columns you drag onto, for deciding in
  advance.
- **Journal** — the day's notes, autosaved into the existing `notes` table.
- **Chooser integration** — a planned task leaves the To-do List (Covey's master list), and
  only that view.

### Out of scope

- **Big Rocks.** Templates that survive being dragged onto a day. Explicitly deferred: "Let's
  forget big rocks for now."
- **Weekly Planning wizard integration.** The wizard is untouched. The week grid stands alone.
- **GTD outcome / "done when" fields** on projects and tasks. Discussed, deferred.
- **An hour grid on the day page.** The Appointments pane is a read-only list; the Weekly
  Schedule tab keeps sole ownership of time-block editing.

## Decisions

### A daily line is its own row, not a node — and not a Today Project

`daily_items` is a new table. `node_id` is nullable: null is a jotted line, set is a task
pulled off the master list. Both render identically.

Rejected: **making every jotted line a task node in the Inbox.** It keeps one task concept,
but it fills the Inbox with a dozen trivial rows a day that all want triaging — which is
precisely the friction the tab exists to remove. "Check oil" does not want a result area.

Rejected: **a Today Project.** The known workaround, and the thing this spec is written
against.

The escape hatch is **Promote to task…**, which mints a real node in the Inbox and links the
row. Nothing is trapped on a day page.

### Day assignment is stored in `daily_items`, surfaced as a field on the task

Lee's requirement was interoperability:

> I want this to be interoperable with the rest of the system, so there should be a field I
> can set on existing tasks so they will appear on my daily list on a certain day. We have a
> target start date on tasks already. Maybe that would be a good field to use?

Delivered as a **Plan for day** field on the task and (task-less) project forms — but backed
by a `daily_items` row, not a column.

Rejected: **reusing `task_details.target_start_date`.** It already feeds the chooser score
(`targetStartScore`), so clearing your day plan would silently shift rankings. It pairs with
`target_end_date` as an Achieve scheduling _range_, and overwriting it daily loses that
meaning — this would have been the Today Project mistake again, one field down. And decisively:
a single column cannot carry a **forwarded** mark, so Wednesday could never show what became
of Wednesday.

One table, three ways in — type it on the day page, drag it in the week grid, set it on the
task — all writing the same row. That is what "harmonious, not parallel" means concretely.

### Completion is authoritative on the daily row

`daily_items.completed_at` decides "done on this day". It **cannot** be derived from
`nodes.state`, because completing a recurring task resets that node to `not_started`
(`applyStateTransition`). Without a local stamp, checking off a routine would silently
un-check itself the instant it succeeded. Checking a node-backed row still calls
`applyStateTransition`, so recurrence, the effort reset and the `task_completions` log all
fire exactly as they would from the outline.

### Carry-over forwards, and says so

Unfinished rows from earlier days move to today when you open it; the original day keeps the
row with `forwarded_to` set and renders "→" instead of a check box. Rejected: **silently
moving the row**, which would make a past day claim you planned nothing. A day page should
say what you meant to do _and_ what became of it.

Runs on read rather than on a schedule, so it does not depend on the app being open at
midnight, and is idempotent so repeated loads settle.

### The ranking rules are shared, not copied

TC Priority already had a complete, tested letter+rank engine. Rather than write a third
copy, the pure core moved to `src/lib/priority/letterRank.ts` and both bind it with their own
accessors. Same for the typed cell (`LetterRankCell`). The two rankings stay different
_fields_ answering different questions, over identical _rules_.

## Context

- PlanPlus references: `screenshots/PlanPlus/DailyView.jpg` (the three-pane day page and the
  status-mark menu — None / Completed / Forwarded / Completed and Forwarded / Deleted /
  Delegated / In Process), `screenshots/PlanPlus/Franklin_Covey_software_weekly_planning.jpg`
  (master list plus day columns), `screenshots/PlanPlus/FC Paper Planner Daily.jpg`
  (Appointments | Task List | Notes).
- Achieve manual §8 for the candidate rule this borrows: "leaf tasks (and task-less
  projects)" — which is why a task-less project can be planned onto a day too.

## Standards applied

`agent-os/standards/development/testing.md`, `agent-os/standards/database/migrations.md`,
`agent-os/standards/components/ux-principles.md`, `agent-os/standards/api/error-handling.md`.

## Status

Active. Implemented and verified end to end; see `plan.md` for as-built detail and the
changelog.
