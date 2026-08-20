# Exercise groups — supersets, circuits, mechanical drop sets

**Status: frozen / complete** (2026-08-20)  
Spec folder: `agent-os/specs/2026-08-20-1233-exercise-groups/`

## Spec relationships

- **Extends:** `agent-os/specs/2026-07-30-1240-fitness-strength-log/` — the founding MVP
  (catalog is source of truth, autosave, history is sacred, destructive `replaceSession`
  rebuild). Nothing superseded.
- **Extends:** `agent-os/specs/2026-08-20-1115-timed-isometric-exercises/` — the `measure`
  axis and the derived `setColumns` seam that grouped rows reuse. Its rule that **shape is
  inferred from the data's own nulls, never from a stored prescription** is what makes round
  count derived here. Nothing superseded.
- **Extends:** `agent-os/specs/2026-08-17-1238-workout-exercise-notes/` — the
  `sessionDraft` → `SessionEditor` seam; per-exercise notes get re-homed, not changed.

Achieve Planner has no fitness module; `docs/achieve-planner/` does not govern this.

## Context

The fitness tracker logs a session as a flat, ordered list of exercises, each owning its own
sets. That shape can only express straight sets. Supersets, circuits, and mechanical drop
sets are all performed the same way — an ordered group of exercises done back-to-back with
rest only at the end, repeated for N rounds — and none of them can be recorded today. You
either log them as unrelated exercises and lose the structure, or you don't log them.

Nothing existed to build on: a repo-wide search found no superset/circuit/group concept in
the schema, code, or any spec, and no roadmap line beyond the medium-term
"routines/templates" entry.

**The three names are one structure.** A superset is a group of two, a circuit a group of
three or more, a mechanical drop set a group of the same movement in descending mechanical
advantage — usually one round. The only real variables are how many members, how many
rounds, and the rest at the end of a round. So we model one thing and let the label be
display chrome.

Outcome: on the phone, mid-workout, you can create a group, log it round by round, and have
the rest timer start itself when a round ends.

## Decisions

1. **One entity, optional label.** An exercise group has ordered members, a display-only
   label ("Superset", "Circuit", "Drop set", or anything typed), and a rest value. The label
   changes no behavior.
2. **Round count is derived, never stored.** Round N is set N of each member.
   `rounds = max(sets.length)` across members. There is no `rounds` column — that would be
   the module's first prescription/target field, which the timed spec explicitly deferred.
   Members with unequal set counts (you bailed on the last round of A2) are honest data and
   must render, not crash.
3. **Rest lives on the group only.** One `restSeconds` for rest after a round; members are
   always back-to-back. No per-member rest.
4. **Group position derives from member `sortKey`s** — members are contiguous. No second
   ordering keyspace, no change to how ordering works. The read side folds _consecutive_
   runs of equal `groupId`, so a non-contiguous group (unreachable through the app) degrades
   into two groups rather than corrupting anything.
5. **Straight drop sets are not a feature.** Same exercise, less weight each set — already
   expressible, since weight is per-set. Explicitly out of scope, not deferred.
6. **Grouped work logs round-major**; ungrouped exercises keep today's exercise-major block
   untouched.
7. **Rest timer auto-starts for groups only.** Ungrouped `+ Add set` stays manual — that
   broader change was considered and declined.

## Data model

New table `workout_session_groups` in `src/db/schema.ts`, beside `workoutSessionExercises`:

| column        | type                                     |
| ------------- | ---------------------------------------- |
| `id`          | uuid PK defaultRandom                    |
| `userId`      | uuid → `users.id` **cascade**            |
| `sessionId`   | uuid → `workout_sessions.id` **cascade** |
| `label`       | text notNull default `''` — display only |
| `restSeconds` | integer nullable                         |

- check `workout_session_groups_rest_positive`: `rest_seconds is null or rest_seconds > 0`
  (mirrors `workout_sets_duration_positive`)
- index `workout_session_groups_session_idx (user_id, session_id)`
- no `createdAt`/`updatedAt` — consistent with `workout_session_exercises`
- **no `sortKey`, no `rounds`** — both derived

`workout_session_exercises` gains `groupId uuid` nullable → `workout_session_groups.id`
**`on delete set null`**. Deleting a group ungroups its members; it never destroys logged
work. Migration generated with drizzle-kit; no backfill, every existing block is ungrouped.

## Acceptance criteria

- [ ] A group can be created from adjacent exercises, labelled, given a rest value, and removed
- [ ] Grouped work logs round-major: `Round 1` shows A1 then A2, `Round 2` the same
- [ ] Members with different `measure`/`equipment` each render their own set columns in one group
- [ ] `+ Add round` appends a set to every member and starts the rest timer at the group's value
- [ ] A member with fewer sets than the group's round count renders a gap, not a crash
- [ ] Ungrouped exercises look and behave exactly as they do today, timer included
- [ ] A grouped session survives autosave, reload, and `replaceSession` with structure intact
- [ ] Ungrouping preserves every logged set
- [ ] A second user cannot read, update, or delete another user's group rows
- [ ] Round count is nowhere stored — grep confirms no `rounds` column or field

## Changes from original plan

Material refinements during implementation (requirements, design, scope). Omit pure code
polish.

| #   | Change                                                                                                                                              | Why                                                                                                                                                                                                                                                                                                                                                                                                              |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Inside a group, an interior blank set is kept and written with `completed: false`.** Only trailing blanks are trimmed.                            | Deriving rounds from set index means the index _is_ the round. Dropping a blank round the way an ungrouped exercise does would slide every later set onto the wrong round — silent misattribution of logged work. `completed` was already on the table and unused, and `formatSetsLabel` already skips it, so a sat-out round keeps the alignment without appearing in history. Ungrouped behavior is unchanged. |
| 2   | **Round-major logging enforces a "no holes" invariant**: `addRound` levels every member, and a member may only fall _short_ at the end.             | The alternative — arbitrary holes — cannot round-trip through `workout_sets.set_index`, which is assigned sequentially on insert. Trailing shortfall is also the case that actually happens (you ran out of time on the last round).                                                                                                                                                                             |
| 3   | Two new pure modules beyond the plan: `groupEdit.ts` (join / ungroup / add member / splice round results) and `hold.ts`.                            | Contiguity is the invariant the whole no-sort-key design rests on. Enforced in tested lib code rather than inferred from how the buttons happen to be wired; `hold.ts` shares the stopwatch state between the two block types without a cycle.                                                                                                                                                                   |
| 4   | `SetHeader` / `SetRow` / `PlateLine` / `ExerciseNotes` / `LastSessionHint` extracted from `SessionEditor` into `SetRow.tsx` and `ExerciseMeta.tsx`. | The group view needs the same rows; one shared implementation per concern. `SetRow` gained an optional `indexLabel` so the gutter can read `A1`, which is the only change to it.                                                                                                                                                                                                                                 |
| 5   | A group with **no rest typed still starts the timer**, at the session's remembered duration.                                                        | Finishing a round is the moment the timer exists for. The group's rest is an override, not a precondition — requiring it would leave the common case (superset, rest left blank) with no timer at all.                                                                                                                                                                                                           |
| 6   | Column headers repeat inside a group only where a member's shape differs from the member above it.                                                  | Rendering one header per member made a plain two-barbell superset show the same `# Reps Weight Unit` row twice. Seen in the browser, fixed there.                                                                                                                                                                                                                                                                |
| 7   | Dropped from Task 2: extending `src/db/sample-data.ts` with a grouped session.                                                                      | The premise was wrong — `sample-data.ts` seeds no fitness rows at all, so there was nothing to extend.                                                                                                                                                                                                                                                                                                           |

## Task 1: Save spec documentation

Create this folder with `plan.md` (Status: active), `shape.md`, `standards.md`,
`references.md`. No `visuals/` — none provided.

## Task 2: Schema and migration

Schema change above plus the generated migration. Extend `src/db/sample-data.ts` with one
grouped session so seeded data exercises the new path.

## Task 3: Domain types and pure grouping logic

`src/lib/fitness/types.ts`:

- `SessionGroupInput = { label?: string; restSeconds?: number | null }`
- `SessionExerciseInput` gains `groupIndex?: number | null`; `SessionInput` gains
  `groups?: SessionGroupInput[]`. Exercises stay a **flat ordered array** — membership is a
  pointer, so ordering needs no new rules.
- `SessionGroupMeta = { id; label; restSeconds }`; `SessionExerciseView` gains
  `groupId: string | null`; `SessionDetail` gains `groups: SessionGroupMeta[]` while
  `exercises` stays flat, so Find, history and session labels are untouched.

New `src/lib/fitness/sessionGroups.ts` — pure, no React:

- `groupSessionItems(exercises, groups)` folds consecutive equal `groupId` runs into
  `{ kind: "group", … , rounds }`, everything else into `{ kind: "exercise", … }`.
- `itemLabels(items)` letters **every** top-level item in order; a group's members read
  `A1`, `A2`, an ungrouped exercise reads just its letter.

New `src/lib/fitness/rounds.ts` — pure round operations over draft members:
`roundCount`, `addRound` (reusing `setFromPrevious`), `removeRound` (never below one set),
and `roundRows(members, roundIndex)` returning a row per member that is either a real set or
a **gap**. That last function is what makes unequal set counts renderable rather than a
crash, and is why this is a tested module rather than inline component code.

Tests: `sessionGroups.test.ts`, `rounds.test.ts`.

## Task 4: Draft shapes

`src/lib/fitness/sessionDraft.ts` gains `DraftGroup = { key; label; rest }` — rest kept as
**text**, the same convention as `DraftSet.duration`, so a half-typed value survives.
`DraftExercise` gains `groupKey: string | null`; `SessionDraft` gains `groups`.

`draftToSessionInput` maps `groupKey` → `groupIndex`. **The edge case that needs a test:**
members are dropped when they have no filled set, so a group can end up empty — it must be
dropped and the survivors reindexed, or `groupIndex` silently points at the wrong group.
`draftFromDetail` rebuilds `groups`/`groupKey` from `SessionDetail`.

## Task 5: Queries and mutations

`getSessionDetail` also selects the session's groups and each block's `groupId`.
`listSessions` is **unchanged** — the history list stays a per-exercise glance.

`createSession` / `replaceSession` accept groups. `replaceSession` already rebuilds
destructively; it deletes session exercises first (cascading sets), then groups, then
inserts groups, captures their ids, then inserts exercises carrying `groupId` — all in the
existing transaction, all scoped by `userId`. Group ids churn on every autosave; nothing
references them across saves, which is why no group needs a stable identity.

## Task 6: Integration tests

Extend `src/lib/fitness/mutations.integration.test.ts`: create-with-group and read back
through `getSessionDetail`; mixed ungrouped → group → ungrouped ordering surviving a
`replaceSession` round-trip; unequal member set counts; ungrouping preserving every set; the
`rest_seconds > 0` check rejecting `0`; and a **cross-user** case proving a second user
cannot read, update, or delete the first user's group rows.

## Task 7: Round-major group UI

New `src/components/fitness/ExerciseGroupBlock.tsx`:

- **Header** — letter badge, label field (preset chips plus free text), rest field, ⋯ menu
  (Ungroup, Remove group).
- **Member strip** — per member: `A1` + `ExercisePicker`, edit-catalog link, the
  per-exercise notes disclosure and the **Last time … tap to copy** hint. Both are
  per-exercise facts, so they belong here rather than in the rounds; this re-homing is what
  the round-major layout forces.
- **Rounds** — per round a `Round N` subheading, then one set row per member. Each member
  keeps its **own** `setColumns({ measure, equipment, unilateral })` grid and inline
  `gridTemplateColumns`, so a `time` member and a `reps` member coexist in one circuit. The
  member label renders into the existing index gutter instead of the set ordinal, so
  `setColumns.ts` needs no change.
- **Footer** — `+ Add round`, `+ Add exercise to group`.

`SessionEditor` renders grouped items via `groupSessionItems`; ungrouped items keep
rendering today's `ExerciseBlock` verbatim. `runningHold` is already keyed
`{ blockKey, setIndex }`, so the hold stopwatch needs no change. Grouping is reached through
**"Group with previous" / "Group with next"** on an ungrouped block's ⋯ menu — both always
produce a contiguous span, and neither needs drag-and-drop, which does not exist anywhere in
the fitness UI.

## Task 8: Wire the rest timer

`RestTimer` already exposes `onRegisterStart` for exactly this and it has **never been
connected** — the editor renders `<RestTimer />` with no props, so the hook is dead code.
Widen it to `(start: (seconds?: number) => void) => void`; `start` runs at
`seconds ?? durationSec` and does **not** persist an override to localStorage, so a group's
rest cannot overwrite the remembered preference. The editor keeps a `restStartRef` and
passes a stable registrar. `+ Add round` starts the timer at the group's rest; ungrouped
`+ Add set` stays manual.

## Task 9: Verify, freeze spec, update roadmap

Lint, typecheck, `test:unit` — **checking for the Postgres skip warning**, since Tasks 5–6
change `mutations.ts`/`queries.ts`. Then `next build`, dev server, and `npm run smoke`.
Then drive it in the browser: create a superset, log three rounds, watch the timer fire,
reload, ungroup, delete.

Freeze `plan.md`/`shape.md`, complete **Changes from original plan**, and add a `✅` fitness
line to `agent-os/product/roadmap.md` citing this spec.

## Follow-ups (new work — not amendments to this frozen spec)

- Group structure in the history list. `listSessions` still summarises per exercise, so a
  superset reads as two independent lines there. Deliberate — the list is a glance surface —
  but a `Superset: A + B` line is the obvious next ask.
- Reordering exercises or groups. Still no affordance anywhere in Fitness; "Group with
  previous / next" works only on neighbours, so grouping two lifts that are not adjacent
  means deleting and re-adding one.
- `formatExerciseSelectLabel` still shows only equipment, carried over unresolved from
  `2026-08-20-1115-timed-isometric-exercises`.

## Out of scope

- Straight drop sets (already expressible — weight is per-set)
- Prescribed targets / countdown-to-target of any kind
- Routines and templates (still the standing medium-term roadmap line)
- Drag-to-reorder exercises or groups (no reorder UI exists in fitness today)
- Group structure in the history list, in Find, or in the per-exercise history page
- Per-member rest; per-set notes; EMOM/AMRAP time-domain formats

## Standing rule while this spec is active

On a material change to requirements, design, or scope — including feedback on what actually
got built — update `plan.md` / `shape.md` and append a row to **Changes from original plan**.
Skip pure implementation detail. Freeze when verified.
