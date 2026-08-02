# References — the deferred-date model

## Prior specs this builds on

### `2026-08-01-2030-start-date-is-the-plan` (frozen)

- **Relevance:** established that `target_start_date` is the single source of truth for which
  day a task sits on, and that `daily_items` keeps only what a column cannot hold — the
  forwarded mark, the line crossed off on the day you did it, the per-day ABC rank, and lines
  with no task behind them.
- **Key patterns:** the invariant "a task with a target start has exactly one open day line,
  on that date", maintained in `src/lib/day/sync.ts` and nowhere else. This spec extends that
  invariant with a shelving clause rather than adding a second mechanism beside it.
- **Do not contradict:** target start is the _plan_, not a scheduler output. Its "a day you had
  planned moves, a day you had not is not chosen for you" rule is the direct precedent for
  clearing rather than pushing descendant plans when a project is shelved.

### `2026-07-31-0834-task-recurrence` (frozen)

- **Relevance:** owns the rule that recurrence never _creates_ a deadline, only moves one you
  set, so a routine can never become Overdue. It also established that a completing recurrence
  always writes `deferred_date`, whichever date the pattern is anchored on, because that is
  the only thing taking a finished routine out of the Chooser.
- **Key patterns:** `moveDates` in `src/lib/tree/mutations.ts` — which fields are _moved_ and
  which are _created_ on the next occurrence.
- **Consequence for this spec:** because recurrence always writes a deferred date, and this
  spec makes that date imply the `postponed` state, every routine reads "P" between cycles.
  Accepted deliberately.

### `2026-07-31-1520-persistent-ui-state` (frozen)

- **Relevance:** the `user_settings` table, scopes and write queue that the grid toggle joins.
- **Key patterns:** `grid:{tabId}` payload shape `{ v, order, widths, filters, sort,
collapsedGroups, view }`, parsed with a version field; `src/components/grid/useGridState.ts`
  is the entry point. Adding `showDeferred` follows the same version-bump-and-default path.

## In-repo precedent for the unification

### The Chooser's states list — `src/lib/chooser/types.ts:37`

- **Relevance:** the Chooser already had this exact problem and solved it. The comment is the
  argument for this whole spec:

  > Replaces what began as a single `includeDeferred` flag. Two overlapping mechanisms — a
  > hard-coded "never show completed or cancelled" plus one toggle for postponed — meant the
  > answer to "why is this row missing?" lived in two places and only one of them was
  > adjustable. One list settles it: what is ticked is what you see.

- **Key patterns:** one list of states rather than a boolean per hiding rule; hidden things
  _offered_ rather than forbidden, "because a hidden rule you cannot inspect is worse than a
  checkbox you will not tick".
- **Follow-up it implies:** the grids should eventually adopt the same states list in place of
  `includeDeferred`. Out of scope here; the boolean is made correct and persisted instead.

## Code to study before changing

| What                           | Where                                                       | Why                                                                                                       |
| ------------------------------ | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| The duplication being removed  | `src/lib/tree/slice.ts:81`                                  | Drops `postponed` rows, comment calls it "Achieve's Deferred toggle off"                                  |
| The other half of it           | `src/lib/chooser/views.ts:240`, `src/lib/tree/status.ts:59` | Hide by `deferred_date` instead                                                                           |
| Memoized ancestor walk to copy | `src/lib/tree/derive.ts` (`lapFor`)                         | Inherited shelving is the same shape as inherited priority                                                |
| Recursive CTE pattern          | `src/lib/tree/queries.ts` (`loadOutline`)                   | The ancestor lookup in `sync.ts` is its mirror, walking up                                                |
| Day-line invariant             | `src/lib/day/sync.ts`                                       | The one place that decides where an open line lives                                                       |
| State transitions              | `src/lib/tree/mutations.ts:430` (`applyStateTransition`)    | Hardcodes `now`; gains an explicit instant                                                                |
| Allowlist that fails silently  | `src/lib/detail/mutations.ts` (`TASK_KEYS`)                 | A column moved out of the table but left in the list typechecks and is dropped on the way to the database |
| Existing toggle, unpersisted   | `TasksGrid.tsx:210`, `ProjectsGrid.tsx:302`                 | `useState(false)` — the control this spec fixes rather than duplicates                                    |

## Source material

Achieve Planner's manual, as supplied by Lee: Postponed (P) shelves indefinitely and
suppresses schedule warnings; a future Target Start Date is a planned deferral that still
participates in scheduling. Note that this comparison is **target start vs. postponed**, not
deferred vs. postponed — the manual largely predates the Deferred Date feature, which arrived
around 1.8.5. `agent-os/product/achieve-backlog-notes.md` holds the wider backlog of Achieve
behaviour not yet built.
