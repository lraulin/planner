# Date model

Four dates live on `nodes`. They look alike and are not. Getting them wrong is how the
Chooser and the day page end up fighting each other, so the meanings and the writers are
pinned here.

## The four dates

| Column              | Means                                                      | Who writes it                                        |
| ------------------- | ---------------------------------------------------------- | ---------------------------------------------------- |
| `target_start_date` | The day you **plan to begin** — the day plan               | Day page drag, Plan for day, recurrence, detail form |
| `target_end_date`   | When you intend to finish (often equal to start for a day) | Day plan (both ends), detail form                    |
| `deadline`          | When it is **due** — the hard date                         | Detail form, outline column                          |
| `deferred_date`     | **Expiry of the postponed shelf** — optional               | Detail form, recurrence on complete/skip             |

`actual_start_date` and `date_completed` live on `task_details`. They are **records**, not
plans: when work really began, and when it was finished. They are deliberately editable so a
late tick-off can be backdated, and they couple to state in both directions (below).

## One shelving concept

**`postponed` is the state; `deferred_date` is its optional expiry.**

- No date → shelved until you say otherwise (Achieve's Postponed).
- A date → it comes back on its own (Achieve's Deferred Date).
- One hiding rule everywhere: effectively postponed → hidden from Chooser / grids when the
  "Postponed" toggle is off.

Expiry is **derived at read time, never swept**. A postponed row whose deferred date has
passed reads as not-started with nothing having written to the row. Stored state can stay
`postponed` indefinitely; nothing reads it without the helper.

Clearing a deferred date leaves the node postponed indefinitely. Un-shelving is a state
change. Setting the state to postponed by hand clears a deferred date that has already
passed — otherwise it would un-shelve the instant it was shelved.

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

Setting a date implies a state, when the date is **newly** set (the drawer posts its whole
draft every save):

| Date newly set                     | Implied state            |
| ---------------------------------- | ------------------------ |
| `date_completed`                   | completed (at that date) |
| future `deferred_date`             | postponed                |
| `actual_start_date` on not-started | in_progress              |

Precedence when one save touches more than one: **finished beats shelved beats started**.
An explicit State dropdown wins over anything implied by a date.

`applyStateTransition` takes an explicit instant so a backdated completion writes history
and steps a series from _that_ day, not from now. Recurrence leaves the routine `postponed`
until its next occurrence — the deferred date it just acquired _is_ that shelf's expiry.

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
