# The deferred-date model — shaping notes

**Status: active**

## Scope

One shelving concept for the whole tree, replacing two overlapping mechanisms; the scheduling
dates unified onto `nodes` so every node type can carry them; a database rule that a plan
cannot precede availability; and a written standard for the date model so the next feature
does not have to re-derive it.

### Out of scope

- Replacing the grids' `includeDeferred` boolean with the Chooser's states list. It is the
  right end state and `chooser/types.ts:37` argues for it, but it is a bigger UI change than
  this spec. The boolean is made correct and persisted here instead.
- Project recurrence. Moving `deferred_date` onto `nodes` unblocks it — schema.ts:688 names
  that column as the blocker — but it is its own spec.
- The effort-based scheduler. It stays dormant. Only its boundary is recorded.
- The Project form's `PlanForDayField`. Day lines stay tasks-only.

## How we got here

Lee brought an account of Achieve's history: Start Date is the legacy of the original
effort-based scheduling engine, where it was an _output_ — when the system predicted work
would begin, given effort and capacity. Deferred Date was bolted on around 1.8.5 as a
GTD-style tickler, and the two were never unified. His question was whether we had layered the
same confusion here.

Mostly we had not. `target_start_date` is already the single source of truth for which day a
task sits on (the 2026-08-01-2030 spec settled that), and `deferred_date` is already purely
availability. That split is clean and survives.

But three gaps and one duplication surfaced.

### The duplication we nearly doubled down on

The first draft of this plan proposed a "Show deferred" toggle for the Tasks and Projects
grids, keyed on the deferred date. Lee asked why deferral was not simply a **state**, given
that `postponed` already exists and that we do not want two versions of the same thing.

He was right, and the codebase already said so in two places:

- `slice.ts:81` drops `postponed` rows with the comment _"Achieve's Deferred toggle off"_. The
  toggle already existed, keyed on state.
- `chooser/types.ts:37` records the Chooser having fought this exact battle: it replaced a
  single `includeDeferred` flag with a states list because two overlapping mechanisms "meant
  the answer to 'why is this row missing?' lived in two places and only one of them was
  adjustable."

The proposed toggle would have been a third mechanism sitting beside two that already
disagreed.

### What the manual settles, and what it does not

Lee then supplied the manual's comparison: Postponed is for shelving **indefinitely** and
suppresses schedule warnings; a future **Target Start Date** is a planned deferral with a
specific date, and still participates in scheduling and "Behind Schedule" warnings.

That comparison is **Target start vs. Postponed**, not Deferred vs. Postponed — consistent
with Lee's earlier observation that the manual is largely silent on Deferred Date, which
postdates it. Mapped onto our model, where target start is the day plan rather than a hiding
mechanism, the manual's two poles are:

| Manual                                    | Ours             |
| ----------------------------------------- | ---------------- |
| "Planned deferral, stake in the ground"   | `deferred_date`  |
| "Shelved indefinitely, unspecified"       | `postponed`      |
| "Future target start" (its deferral tool) | the Day tab plan |

Read that way the manual _supports_ unification: its two poles differ only on **dated vs.
undated**, which is one concept with an optional date. Its other property of Postponed —
excluded from scheduling, warnings suppressed — we already apply to deferred items, since
`scheduleStatus` returns `deferred` and never escalates to overdue. Unifying costs nothing we
currently have.

## Decisions

- **`postponed` is the state; `deferred_date` is its optional expiry.** Undated = shelved
  until you say otherwise. Dated = comes back on its own.
- **Expiry derived at read time, not swept.** Same shape as the existing `isDeferred`; no
  background job, no clock in the database.
- **Clearing a deferred date leaves the node postponed indefinitely.** An earlier draft had it
  un-shelving the node; that was wrong, because it would make the indefinite shelf — the whole
  reason for having the state as well as the date — unreachable by the obvious gesture.
- **Setting the state to postponed clears an already-passed deferred date**, or the node
  un-postpones the instant it is postponed.
- **Routines read "P" between cycles.** Recurrence already writes a deferred date on every
  completion, and under unification that implies the state. Accepted deliberately: behaviour
  is unchanged and the State column now says _why_ a row is not in the Chooser.
- **Latest wins, indefinite as infinity.** Effective shelving is inherited from any ancestor,
  expiring at the latest contributing date; an indefinite postponement up the chain never
  expires. `completed` / `cancelled` beat inherited shelving.
- **Inherited, never copied down.** Copying breaks on re-parenting, cannot be undone (which
  children had their own date?), and would drift as each child's recurrence rewrites its own
  `deferred_date` every cycle.
- **Shelving clears conflicting descendant plans rather than pushing them.** A task planned for
  Tuesday and shelved to November is not _planned for November_. Same principle as recurrence's
  "a day you had planned moves, a day you had not is not chosen for you."
- **A shelf and a plan coexist.** Lee's case: taxes, due date known a year out — "back on my
  radar in February, I intend to start in March, due in April". The CHECK permits it; it
  forbids only a plan preceding availability. This killed a first-draft rule that an
  effectively-postponed node has no day line: the March line would never have been created,
  since expiry is derived rather than swept and nothing writes on the day the shelf ends, and
  a `daily_items` row is stored state that cannot be derived. The rule narrowed to suppressing
  a line only while the day it would sit on falls _inside_ the shelf.
- **State and dates couple both ways.** Setting an actual start date starts the task; setting a
  completed date completes it _at that date_; setting a deferred date postpones it.
- **All scheduling dates onto `nodes`**, with a CHECK that a target start may not precede a
  deferred date. The cross-table split would have made the constraint impossible, and the
  outline already presents these as one field per node.

## Context

- **Visuals:** none.
- **References:** `2026-08-01-2030-start-date-is-the-plan` (frozen — target start is the day
  plan), `2026-07-31-0834-task-recurrence` (frozen — why a routine has no deadline),
  `2026-07-31-1520-persistent-ui-state` (frozen — the settings store the toggle joins).
  In-repo precedent for unification: `src/lib/chooser/types.ts:37`.
- **Product alignment:** no roadmap item; this is correctness and coherence work on shipped
  features.

## Standards applied

- `database/migrations` — a data-preserving column move across three tables.
- `development/testing` — pure logic in `src/lib/**` with tests beside it; every database
  mutation gets an integration test including the second-user case.
- `components/ux-principles` — the grid toggle is an inline control, not a modal.
