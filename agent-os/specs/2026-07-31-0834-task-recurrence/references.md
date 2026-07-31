# References for task recurrence

## Similar implementations to borrow from

### Appointment recurrence — the near miss

- **Location:** `src/lib/schedule/recurrence.ts`, `src/components/schedule/AppointmentDrawer.tsx`
- **Relevance:** The only recurrence in the repo, and the source of the enums
  (`recurrence_frequency`, `recurrence_end`) and the date math we reuse. But it solves a
  **different problem**: it expands one stored master into many occurrences on a calendar,
  and stores no occurrence. Ours defers a single persistent row. Do not unify them.
- **Key patterns:** `addDays` / `addMonths` (with the end-of-month clamp — Jan 31 + 1 month →
  Feb 28/29) / `addYears`, all module-private and worth extracting rather than
  re-implementing. `pastSeriesEnd` shows the day-granular `until` comparison if end
  conditions are ever added.
- **Do not copy:** the drawer's recurrence controls are hand-rolled `<label>` + `<select>`
  with Tailwind strings duplicated from `fields.tsx`, and it calls `window.confirm` — a
  standing violation of `components/modal-pattern`.

### The two completion write paths

- **Location:** `src/lib/tree/mutations.ts` (`setState`), `src/lib/detail/mutations.ts`
  (`saveNodeDetail`)
- **Relevance:** Both already special-case completion, independently, with the same
  `completedAt: state === "completed" ? new Date() : null` line and a comment in the detail
  one noting it "has to follow the state whichever surface changed it." That duplication is
  exactly the hazard this feature has to resolve.
- **Key patterns:** `type Executor = Db | Tx` so every private helper composes inside
  `db.transaction`; `requireNode(tx, userId, nodeId)` as the user-isolation gate that
  isolation tests assert against.

### The only existing subtree walk in the data layer

- **Location:** `src/lib/tree/mutations.ts` — `applyCategoryToResultAreaSubtree`
- **Relevance:** The template for walking a node's descendants inside a transaction. A BFS
  with a queue, one query per level.

### Derived status, and the `today` convention

- **Location:** `src/lib/tree/status.ts`, `src/lib/chooser/dates.ts`
- **Relevance:** `scheduleStatus()` is where `Deferred` lands. Both modules establish the
  convention this feature follows: `today` is a `YYYY-MM-DD` **string** passed in by the
  caller, never `new Date()` inside the module — so the logic is directly testable and the
  server and client renders agree.
- **Key patterns:** `daysBetween()` parsing both sides as UTC midnight so daylight saving
  cannot shift a boundary; returning the neutral value when `today` is null (server render).

### Chooser candidacy

- **Location:** `src/lib/chooser/views.ts` — `isChooserCandidate`, `DEFAULT_STATES`
- **Relevance:** Where deferred tasks get filtered out. The comment on `DEFAULT_STATES`
  already describes `postponed` as "what Achieve's Deferred toggle turns back on" — useful
  context for why we chose a derived date rule over that state instead.

### Form field vocabulary

- **Location:** `src/components/detail/fields.tsx`, `src/components/detail/TaskForm.tsx`
- **Relevance:** `SelectField` / `NumberField` / `Section` / `FieldGrid` are the whole UI.
  `TaskForm`'s General tab already holds the `Dates` section including **Deferred until**,
  which is what recurrence drives — so the new section goes directly beneath it.
- **Key patterns:** module-level `*_OPTIONS` consts feeding `SelectField`; every field bound
  through `patch` (core `nodes` columns) or `patchTask` (side table), never a direct write.

## Prior specs

| Spec                                                            | Why it matters here                                                                                                                                                                                                                    |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `agent-os/specs/2026-07-30-1858-task-chooser` (frozen)          | Built `isChooserCandidate`, the score, and the pure-with-`today` contract this feature filters inside. Also the reason reset-in-place matters: TC Priority is keyed by node id, so a regenerated copy would lose its rank every cycle. |
| `agent-os/specs/2026-07-28-1234-weekly-schedule` (frozen)       | Built appointment recurrence, the enums, and the date math. Its plan explicitly deferred "recurring series edit UX", which is unrelated to this.                                                                                       |
| `agent-os/specs/2026-07-27-1318-per-type-detail-forms` (frozen) | Created `task_details` including `deferred_date` and `date_completed`, and recorded recurrence as out of scope at the time. This spec reopens exactly that.                                                                            |

## Source material

| What                                                            | Where                                                                                                       |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Manual — Project/Task Recurrence                                | `docs/APUserManual.md` §3.9                                                                                 |
| Manual — recurrence patterns (date-based vs regeneration-based) | §3.9.1 — the "Regenerate new item N week(s) after each instance is completed" radio is the one we implement |
| Manual — removing recurrence                                    | §3.9.3 — ours is setting Repeats back to Never                                                              |
| Manual — skipping a recurrence                                  | §3.9.4 — follow-up, not in this slice                                                                       |
| Manual — recurrence lead times                                  | §3.9.5 — follow-up, not in this slice                                                                       |
| Manual — Focus field                                            | §3.10 — one of the two per-node values a regenerated copy would have lost                                   |
