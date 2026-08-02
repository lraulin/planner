# The deferred-date model

**Status: active**
Spec folder: `agent-os/specs/2026-08-01-2145-deferred-date-model/`
Delta on: `agent-os/specs/2026-08-01-2030-start-date-is-the-plan/` (frozen),
`agent-os/specs/2026-07-31-0834-task-recurrence/` (frozen)

## Context

Achieve Planner carries dates that look alike and are not: **Target start** ("the day I plan
to do this"), **Deferred** ("don't show me this until"), and a **Postponed** state ("shelved").
Lee's reading of the history — Start Date is the legacy of the original effort-based
scheduler, Deferred was bolted on later for GTD-style tickling — raised the question of
whether we've layered the same confusion here.

Partly, yes. Four gaps came out of the discussion:

1. **Deferral and postponement are the same concept, implemented twice.** `slice.ts:81` drops
   `postponed` rows and calls it "Achieve's Deferred toggle off", while `views.ts:240` and
   `status.ts:59` hide rows by `deferred_date`. Two mechanisms, both named "deferred",
   filtering on different columns. The Chooser already recognised and fixed this shape once —
   `chooser/types.ts:37`: two overlapping mechanisms "meant the answer to 'why is this row
   missing?' lived in two places and only one of them was adjustable."
2. **Deferral is tasks-only.** `deferred_date` lives on `task_details`; `project_details` has
   no equivalent (schema.ts:689 says so). Lee's actual use — "Vote in General Election", "Pay
   Taxes", known up to a year ahead — is projects. And `isChooserCandidate` treats a task-less project
   as a candidate (views.ts:242), so a bare "Pay Taxes" project is in the Chooser now with no
   way to defer it out.
3. **Nothing stops target start < deferred date.** The task sits on today's day page while its
   Status reads "Deferred" and the Chooser refuses it.
4. **Deferral doesn't reach children.** Deferring a project should take its subtree with it.

The manual's own comparison is **Target start vs. Postponed**, not Deferred vs. Postponed —
consistent with Lee's note that the manual is silent on Deferred. Mapped onto our model, where
target start is now the day plan rather than a hiding mechanism, the manual's two poles are
"planned deferral with a stake in the ground" (`deferred_date`) and "shelved indefinitely"
(`postponed`). Those differ only on **dated vs. undated** — one concept with an optional date.
The manual's other property of Postponed, excluded from scheduling with warnings suppressed,
we already apply to deferred items (`scheduleStatus` returns `deferred` and never escalates to
overdue), so unifying costs nothing we have.

Intended outcome: one shelving concept, one date model applying to every node type, a
database-enforced rule that a plan can't precede availability, shelving a subtree inherits,
and a written standard so the next feature doesn't re-derive any of this.

## Decisions

- **`postponed` is the state; `deferred_date` is its optional expiry.** No date = shelved
  until you say otherwise. A date = it comes back on its own. One hiding rule everywhere:
  effectively postponed → hidden.
- **Expiry is derived at read time, never swept.** A postponed node whose deferred date has
  passed reads as not-started. Same shape as the existing `isDeferred`; no job, no clock in
  the database. Stored state stays `postponed` until something writes, which is harmless
  because nothing reads it without the helper.
- **Clearing a deferred date leaves the node postponed indefinitely.** It does not un-shelve
  it — that is a state change. Otherwise the indefinite shelf, which is the whole point of
  having the state as well as the date, would be unreachable by the obvious gesture.
- **Setting the state to `postponed` clears a deferred date that has already passed**, or the
  node would un-postpone the instant it was postponed.
- **Recurrence leaves routines `postponed` between cycles.** Recurrence already writes a
  deferred date on every completion; under unification that date implies the state, so a
  finished routine reads "P until tomorrow". Confirmed with Lee: behaviour is unchanged, and
  the State column now says _why_ the row isn't in the Chooser.
- **All scheduling dates move onto `nodes`.** `target_start_date`, `target_end_date` and
  `deferred_date` join `deadline`, which is already there. `project_details.project_start` and
  `target_end` fold into them and are dropped, as are the three `task_details` columns. The
  outline already presents these as one field per node (`COALESCE(pd.project_start,
td.target_start_date)`, queries.ts:53), so storage comes to match the read model.
- **`CHECK (target_start_date IS NULL OR deferred_date IS NULL OR target_start_date >= deferred_date)`.**
  A plan may not precede availability. Equality is legal and is the normal case — recurrence
  sets both to the same date every cycle.
- **Shelving is inherited at read time, never copied down.** Copying breaks on re-parenting,
  can't be undone (which children had their own date?), and would be shifted out of sync by
  each child's own recurrence.
- **Latest wins, with indefinite as infinity.** A node is effectively postponed if it or any
  ancestor is, and the expiry is the latest of the contributing dates — an indefinite
  postponement anywhere up the chain never expires. `completed` and `cancelled` win over
  inherited shelving: a finished task is not shelved.
- **State and dates couple in both directions.** Setting an actual start date on a not-started
  node sets it in progress; setting a completed date completes it _at that date_; setting a
  deferred date postpones it. `applyStateTransition` currently hardcodes `now` and gains an
  explicit instant, so a backdated tick-off writes history on the day it happened and advances
  a series from there.
- **Shelving clears conflicting descendant plans; it does not push them.** A task planned for
  Tuesday and then shelved to November is not _planned for November_. Clearing the target start
  removes the day line through the existing sync. Same principle as recurrence's "a day you
  had planned moves, a day you had not is not chosen for you." Descendants planned _after_ the
  date are left alone.
- **A shelf and a plan are not incompatible.** "Come back onto my radar on Feb 15; I intend to
  start around Mar 15; it is due Apr 15" is a coherent and expected setup, and the CHECK
  permits it — it forbids only a plan that precedes availability.
- **Day-line sync becomes shelving-aware, narrowly.** `syncDayLineToTargetStart` is the one
  place that decides where an open day line lives. It suppresses the line **only while the day
  it would sit on falls inside the shelf**, not whenever the node is postponed. Suppressing on
  postponement alone would break the case above: the line on Mar 15 would never be created,
  because expiry is derived rather than swept and so nothing writes on Feb 16 to create it. A
  `daily_items` row is stored state and cannot be derived. Under the narrow rule an indefinite
  shelf suppresses everything (its only exit is a state change, always a write), a dated shelf
  suppresses nothing beyond its own end, and a line stranded inside a shelf by re-parenting is
  carried forward by `forwardOpenItems` once the shelf expires.

### Out of scope

- **Replacing the grids' `includeDeferred` boolean with the Chooser's states list.** The right
  end state (`chooser/types.ts:37` argues it), but a bigger UI change than this spec. Noted as
  follow-up; the boolean is made correct and persisted here.
- **Project recurrence.** Moving `deferred_date` up unblocks it (schema.ts:688 names it as the
  blocker) but it is its own spec.
- **The effort-based scheduler.** Dormant. The standard records the one boundary that matters:
  a future scheduler writes its own `scheduled_start` / `scheduled_end` and never
  `target_start_date`, which is now the day plan.
- **The Project form's `PlanForDayField`.** Day lines stay tasks-only (`sync.ts` filters
  `type = "task"`).

## Acceptance criteria

- [ ] A project can be postponed, with or without a date; it and its whole subtree leave the
      Chooser, including a task-less project that was previously unfilterable.
- [ ] A postponed node whose deferred date has passed reads as not-started everywhere, with no
      background job having run.
- [ ] Clearing a deferred date leaves the node postponed; changing the state un-shelves it.
- [ ] A child shelved further out than its shelved parent keeps its own later date; an
      indefinitely-postponed ancestor outranks any dated descendant.
- [ ] A completed task under a postponed project still reads completed.
- [ ] Setting an actual start date on a not-started task sets it in progress; setting a
      completed date completes it and writes history at _that_ date, not now.
- [ ] The database rejects a target start before the deferred date on the same row.
- [ ] Shelving a project clears the target start of descendants planned before the date and
      their open day lines disappear; descendants planned after it are untouched.
- [ ] A node deferred to Feb, planned for Mar and due Apr keeps its Mar day line throughout,
      and that line is still there after the shelf expires with nothing having written to it.
- [ ] An indefinitely-postponed node has no open day line whatever its target start; the line
      returns when its state changes.
- [ ] Re-parenting a task under a shelved project leaves it with no open day line while the
      day it would sit on falls inside the shelf.
- [ ] The grids' "Show deferred" toggle survives a reload and defaults to showing.
- [ ] A second user cannot read, change or delete the first user's states or dates.

## Changes from original plan

Material refinements during implementation (requirements, design, scope). Omit pure code
polish.

| #   | Change                      | Why |
| --- | --------------------------- | --- |
|     | _(filled during implement)_ |     |

## Task 1: Save spec documentation

Create `agent-os/specs/2026-08-01-2145-deferred-date-model/` with `plan.md` (this plan,
**Status: active**, empty **Changes from original plan** table), `shape.md`, `standards.md`
(`database/migrations`, `development/testing`, `components/ux-principles`) and `references.md`
pointing at the two frozen specs and at `chooser/types.ts:37` as the in-repo precedent.

## Task 2: Move the scheduling dates onto `nodes`

`src/db/schema.ts` — add `targetStartDate`, `targetEndDate`, `deferredDate` to `nodes` with
the CHECK in the table's extras array beside the existing indexes; delete the three columns
from `taskDetails` and `projectStart` / `targetEnd` from `projectDetails`. Move the doc
comments up with the columns; the `deferredDate` comment is load-bearing and now also has to
say that the column is the expiry of the `postponed` state.

Data-preserving column move, so per `agent-os/standards/database/migrations.md` it cannot be
pure `db:generate` and must not lose its snapshot:

1. `npm run db:generate` for the add/drop SQL **and a correct snapshot**.
2. Hand-edit only the `.sql`, between the adds and the drops: backfill from `task_details`,
   then from `project_details` (no row is ever both); normalise violations before the
   constraint exists (`UPDATE nodes SET target_start_date = NULL WHERE deferred_date IS NOT
NULL AND target_start_date < deferred_date`) and delete open `daily_items` for nodes that
   just lost their target start; add the CHECK **after** the normalisation, or a pre-existing
   bad row fails the migration.
3. Backfill the state too: `UPDATE nodes SET state = 'postponed' WHERE deferred_date > now()
AND state NOT IN ('completed','cancelled')`, so existing deferred rows match the new model.
4. Keep the generated snapshot and journal entry; commit all three together.

## Task 3: Rewire the reads and writes to the new columns

Mechanical, but the allowlist is a silent-failure machine (its own comment says so):

- `src/lib/tree/queries.ts` — the two `COALESCE`s collapse to `t.target_start_date` /
  `t.target_end_date`; `deferred_date` moves off the `task_details` join.
- `src/lib/detail/mutations.ts` — move `targetStartDate`, `targetEndDate`, `deferredDate` out
  of `TASK_KEYS` and `projectStart` / `targetEnd` out of the project keys into the node-level
  list. The test asserting the allowlist covers every `task_details` column fails until this
  is right; that is what it is for.
- `src/components/detail/ProjectForm.tsx` — `projectStart`/`targetEnd` become the shared
  fields, and the form gains a Deferred field matching `TaskForm.tsx:106`.
- `src/lib/day/sync.ts`, `src/lib/day/mutations.ts` (three sites), `src/lib/tree/mutations.ts`
  (recurrence `moveDates`, reopen path at :666) — update `nodes` rather than `task_details`.
  Several already update `nodes` and can merge into one statement.

## Task 4: One shelving concept

New `src/lib/tree/shelving.ts`, pure and testable:

- `postponementOf(node, today)` → `null` | `{ until: Date | null }`, where `until: null` is
  indefinite and a passed date yields `null` (expired).
- `effectiveState(node, inherited, today)` → the state to display and filter on, with
  `completed` / `cancelled` winning over any shelving.

`src/lib/tree/derive.ts` — a memoized ancestor walk beside `lapFor`, which is already exactly
this shape. `OutlineNode` gains `effectivePostponedUntil` (with the indefinite case
distinguished) and `postponedSourceId`, so the UI can say _which_ ancestor shelved a row.

Consumers, all switching from two rules to one:

- `src/lib/chooser/views.ts:240` — `isChooserCandidate` drops the `isDeferred` call; the
  `states` list it already applies now receives the effective state.
- `src/lib/tree/slice.ts:81` — `includeDeferred` tests the effective state, so a child of a
  shelved project is hidden with it.
- `src/lib/tree/status.ts` — `scheduleStatus` takes the effective state rather than a raw
  deferred date.
- `src/components/grid/cells.tsx:465`, `TasksGrid.tsx:126`, `ProjectsGrid.tsx:169-170`,
  `chooserColumns.tsx:202` — the last three call `scheduleStatus` with no deferred date at
  all, so Status filtering and sorting currently disagree with the rendered cell. Passing the
  effective state closes that as a side effect.

Unit tests: parent-only, child-only, both (later wins each way), indefinite ancestor beating a
dated descendant, expired ancestor contributing nothing, completed child under a shelved
parent, deferred grandparent.

## Task 5: Couple state and dates

`applyStateTransition` (`tree/mutations.ts:430`) gains an explicit instant, defaulting to now,
threaded through the completion path so `task_completions`, `completedAt`, `dateCompleted` and
the recurrence anchor all use the given date rather than `now`.

In the detail save path: an actual start date on a not-started node transitions it to in
progress; a completed date transitions it to completed _at that date_; a deferred date
transitions it to postponed. Clearing a deferred date leaves the state alone. Setting the state
to postponed clears an already-passed deferred date.

Integration tests: backdating a completion on a recurring task writes history at that date and
advances the series from it, not from today.

## Task 6: Shelving-aware day lines and descendant cleanup

`src/lib/day/sync.ts` — `syncDayLineToTargetStart` gains one clause: no open day line while
the day it would sit on falls **inside** the shelf (`wanted < effectivePostponedUntil`, with
an indefinite shelf swallowing every day), handled as completed/cancelled already is. Not
"postponed ⇒ no line" — see the decision above for why that breaks the defer-Feb/plan-Mar
case. The ancestor lookup is a small recursive CTE walking _up_ from the node, the mirror of
what `loadOutline` does walking down.

The shelving mutation, in a transaction: write state and date, clear `target_start_date` on
descendants whose target start precedes it, re-sync those day lines. `forwardOpenItems`
(`day/mutations.ts:344`) skips effectively-postponed nodes so the unattended daily
carry-forward can't recreate the state the constraint forbids.

Integration tests, each with the second-user case per `agent-os/standards/development/testing.md`.

## Task 7: Fix the existing toggle

The "Show deferred" checkbox already exists in `TasksGrid.tsx:210` and `ProjectsGrid.tsx:302`
as `useState(false)` — not persisted, and hiding by default. Move it into the `grid:{tabId}`
payload via `useGridState.ts` (version bump, parser default) and **flip the default to
showing**: the hidden set now includes every routine between cycles, so default-hidden would
make a task vanish from the Tasks grid the moment you tick it. Relabel to match the one
concept. `GoalsGrid.tsx:178` passes `includeDeferred: true` and is unaffected.

## Task 8: Write the date-model standard

New `agent-os/standards/product/date-model.md`, added to `agent-os/standards/index.yml`: what
each of the four dates on `nodes` means and who writes it; that postponement is the shelving
concept and the deferred date is its expiry; that shelving is inherited, latest-wins, with
indefinite as infinity; that a plan may not precede availability and where that is enforced;
that `actual_start_date` and `date_completed` are records rather than plans, deliberately
editable so a late tick-off can be backdated, and coupled to state in both directions; and the
scheduler boundary — an effort-based scheduler writes its own columns, never
`target_start_date`.

## Task 9: Verify, freeze, roadmap

`npm run test:unit` (**check for the Postgres skip warning** — the integration tests are the
ones that matter here and they skip silently when Postgres is down), typecheck, lint,
production build. Then drive it with the `run-planner` skill: shelve "Pay Taxes" six months
out and confirm it and its subtree leave the Chooser; tick a daily routine and confirm it
reads P until tomorrow and still appears in the Tasks grid; confirm Status filters and sorts
consistently; toggle "Show deferred" off and reload.

Then complete **Changes from original plan**, mark `plan.md` / `shape.md` **Status: frozen /
complete (2026-08-01)**, and list project recurrence and the grid states-list as follow-up new
work.

---

While this spec is **active**, material changes to requirements, design or scope go into the
relevant sections plus the **Changes from original plan** table. Pure implementation detail
does not. Freeze when verified.
