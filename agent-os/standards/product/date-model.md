# Date model

Four dates live on `nodes`. They look alike and are not. Getting them wrong is how the
Chooser and the day page end up fighting each other, so the meanings and the writers are
pinned here.

## The four dates

| Column              | Means                                                                | Who writes it                                        |
| ------------------- | -------------------------------------------------------------------- | ---------------------------------------------------- |
| `target_start_date` | The day you **plan to begin** — the day plan (and FC day assignment) | Day page drag, Plan for day, recurrence, detail form |
| `target_end_date`   | When you intend to finish (often equal to start for a day)           | Day plan (both ends), detail form                    |
| `deadline`          | When it is **due** — the hard date                                   | Detail form, outline column                          |
| `deferred_date`     | **Expiry of the postponed shelf** — optional                         | Detail form, recurrence on complete/skip             |

**Behind Schedule vs carry-forward:** If target start is in the past and the task is still
NS (or target end is past and it is started), Status is **Behind Schedule** (Achieve §3.8).
Carry-forward moves the open `daily_items` line onto today so the work stays on the day
page, but **does not rewrite** `target_start_date` — the slip is the point.

`actual_start_date` and `date_completed` live on `task_details`. They are **records**, not
plans: when work really began, and when it was finished. They are deliberately editable so a
late tick-off can be backdated (a project finished years ago should not claim "completed
today"), and they couple to state in both directions (below).

They are **calendar days**, stored as **UTC noon** of the intended `YYYY-MM-DD` (not local
midnight, not a wall-clock instant), and **never in the future**. The picker enforces
`max=today` (`localDateKey`); the server clamps. A future start or completion is not a
correction, it is a mistake. Encoding mechanics: `development/dates.md`.

On a **recurring** task, `date_completed` means **last completed** (full history is in
`task_completions`). Changing that field to a different calendar day logs the next finish
and steps the series — the same as setting State to Completed.

## One shelving concept

**`postponed` is the state; `deferred_date` is its optional expiry.**

- No date → shelved until you say otherwise (indefinite hold).
- A date → it comes back on its own (GTD-style tickler).
- One hiding rule everywhere: effectively postponed → hidden from Chooser / grids when the
  "Postponed" toggle is off.

Setting a future deferred date **implies** state `postponed` (see coupling below). You can
still set Postponed with no date for an open-ended park. There is no separate "deferred but
not postponed" path — deferred is not a second status, only the shelf's optional end.

Expiry is **derived at read time, never swept**. A postponed row whose deferred date has
passed reads as not-started with nothing having written to the row. Stored state can stay
`postponed` indefinitely; nothing reads it without the helper.

Clearing a deferred date leaves the node postponed indefinitely. Un-shelving is a state
change. Setting the state to postponed by hand clears a deferred date that has already
passed — otherwise it would un-shelve the instant it was shelved.

### Why we link them (deliberate divergence from Achieve)

In Achieve Planner, **Postponed** (state) and **Deferred Date** (field + Actions → Defer)
were separate, overlapping mechanisms from different eras of the product:

- Deferred Date was the later GTD tickler: hide until a date, auto-reactivate, hard
  constraint for auto-scheduling.
- Postponed was an early state flag: park something, usually without a clean "when does
  this come back?"

For personal use they did nearly the same job — extra ways to hide work. Linking them is
intentional:

| Shape                     | Meaning                                        |
| ------------------------- | ---------------------------------------------- |
| Postponed + deferred date | Temporary; reappears automatically on that day |
| Postponed, no date        | Indefinite hold; you must un-shelve by hand    |

That covers the two real needs (dated tickler vs open-ended park) without a dual hide
system. Achieve's independent Postponed status is not a goal to re-split unless a workflow
appears that needs "state X but also date-hidden" as independent axes.

**Semantic flavor — keep these distinct:**

| State / shape                            | Meaning                                                                  |
| ---------------------------------------- | ------------------------------------------------------------------------ |
| **Postponed** (+ optional deferred date) | Was or would be active; parked (dated tickler or indefinite). Shelf.     |
| **Proposed**                             | Uncommitted incubation — idea / Someday; not the same as "pushed later." |
| Postponed, no date                       | Indefinite hold on something you _were_ treating as real work            |

Do **not** document Someday/Maybe as "postponed projects." Lee's usage is **Proposed**
projects (often with notes/links collected before any commitment). Postponed is the hide /
tickler axis. See `roadmap.md` → GTD as first-class for open questions (Inbox-as-tasks is
valuable for drag-to-process and imports; not pure workaround).

**Possible future cleanup (not planned work):** thin or rename UI labels so the palette
reads clearer — without inventing a second independent "deferred status." Until then, keep
the linked shelf model (Postponed + deferred date) and keep `proposed` as the incubation
state.

## Inheritance

Shelving is **inherited at read time, never copied down**. Copying breaks on re-parenting,
cannot be undone (which children had their own date?), and drifts as each child's recurrence
rewrites its date.

- Latest wins.
- Indefinite is infinity — an undated shelf anywhere up the chain outranks every date below.
- `completed` and `cancelled` win over any shelf: a finished task is not shelved.

See `src/lib/tree/shelving.ts` and the memoized walk in `derive.ts`.

## Plan may not precede availability

```
CHECK (target_start_date IS NULL
    OR deferred_date IS NULL
    OR target_start_date >= deferred_date)
```

Equality is legal and is the normal case for recurrence (both set to the next occurrence).
"Come back on Feb 15; plan for Mar 15; due Apr 15" is coherent and expected.

A plan that would precede a newly set deferred date is **cleared**, not rejected, on the
detail save path — same principle as clearing conflicting descendant plans when a project
is shelved. Descendants planned _after_ a dated shelf are left alone. An indefinite shelf
has no "after", so every descendant plan goes.

## Day lines

`syncDayLineToTargetStart` is the one place that decides where an open day line lives. It
suppresses the line **only while the day it would sit on falls inside the shelf**, not
whenever the node is postponed. Suppressing on postponement alone would break defer-Feb /
plan-Mar: expiry is derived, so nothing writes on Feb 16 to create the line.

- Indefinite shelf → no open day line, whatever the target start.
- Dated shelf → no line for days strictly before the expiry; a plan on or after it stands.
- Re-parenting under a shelved project re-syncs the subtree so inherited shelves apply.

The unattended daily forward skips effectively-postponed nodes so it cannot recreate a plan
the constraint would reject.

## State and dates couple both ways

Setting a date implies a state (the drawer posts its whole draft every save; only a real
change speaks):

| Date change                                      | Implied state            |
| ------------------------------------------------ | ------------------------ |
| `date_completed` set or moved to a different day | completed (at that date) |
| future `deferred_date`                           | postponed                |
| `actual_start_date` filled on not-started        | in_progress              |

`date_completed` is not empty→filled only: after a recurrence cycle it already holds last
completed, so the next finish typed into that field must re-fire. Compared as calendar days
so a no-op re-save does not cycle again.

Precedence when one save touches more than one: **finished beats shelved beats started**.
An explicit State dropdown wins over anything implied by a date.

`applyStateTransition` takes an explicit instant so a backdated completion writes history
and steps a series from _that_ day, not from now. Recurrence leaves the routine `postponed`
until its next occurrence — the deferred date it just acquired _is_ that shelf's expiry.

Mechanics (UTC noon encoding, `toDateKey` / `localDateKey`, clamping, tests) live in
`agent-os/standards/development/dates.md`. This file is only _what the dates mean_.

See `src/lib/detail/stateFromDates.ts`.

## Scheduler boundary

An effort-based scheduler (dormant) writes its own `scheduled_start` / `scheduled_end` and
**never** `target_start_date`. Target start is the day plan.

## Where this is enforced

| Concern                       | Location                                           |
| ----------------------------- | -------------------------------------------------- |
| CHECK constraint              | `nodes` table / migration `0019`                   |
| Effective shelf / state       | `src/lib/tree/shelving.ts`, `derive.ts`            |
| Chooser / grid hide           | `slice.ts`, `chooser/views.ts` (effective state)   |
| Day line sync                 | `src/lib/day/sync.ts`                              |
| Forward skip                  | `src/lib/day/mutations.ts` `forwardOpenItems`      |
| Detail save coupling          | `src/lib/detail/mutations.ts`, `stateFromDates.ts` |
| State transition + recurrence | `src/lib/tree/mutations.ts` `applyStateTransition` |
