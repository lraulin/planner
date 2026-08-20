# Timed / isometric exercises

**Status: active**  
Spec folder: `agent-os/specs/2026-08-20-1115-timed-isometric-exercises/`

## Spec relationships

- **Extends:** `agent-os/specs/2026-07-30-1240-fitness-strength-log/` — the exercise
  catalog / session / sets model, and its rule that catalog config drives the session
  logger's set fields. Nothing in it is superseded; `measure` is a third axis alongside
  `equipment` and `unilateral`.
- **Extends:** `agent-os/specs/2026-08-17-1238-workout-exercise-notes/` — touches the same
  `sessionDraft` → `SessionEditor` block mapping.

## Context

The Fitness log can only describe a set as **reps × weight**. Every isometric — plank,
wall sit, dead hang, loaded carry — has to be faked as reps or not logged at all, and the
one lift shape the log cannot express is the one where the hold _is_ the work.

`workout_sets` already carries `reps`, `reps_left`, `reps_right`, `weight`, `unit`, so a
nullable `duration_seconds` beside them costs nothing and needs no backfill: a set can
hold reps, a duration, or both. What the feature actually needs is for the **catalog
exercise to declare what it measures**, the way it already declares `equipment` and
`unilateral`, so the session logger knows which columns to put on the row.

Outcome: Plank logs `3×0:45`, weighted plank logs `3×0:45 @ 25 lb`, and a push-up with a
bottom hold logs `10 + 20s` — with a stopwatch on the row so the hold is captured rather
than estimated.

## Decisions

- **`measure` on the catalog exercise, three values:** `reps` (default) · `time` ·
  `reps_and_time`. Orthogonal to `equipment`, exactly like `unilateral`.
- **Both columns stay nullable**, so `reps_and_time` also covers a finisher — fill the
  hold on the last set only, leave it blank above. This is why no per-set measure toggle
  is needed.
- **Time and load are independent.** `usesWeight(equipment)` keeps owning the Weight
  column; `measure` only decides Reps/Time. Weighted planks and loaded carries work.
- **One duration per set.** Unilateral stays a reps-only distinction — a side plank is
  logged as two sets, which is what you physically do. Keeps the hybrid row to three
  fields on the phone instead of five.
- **Live count-up stopwatch** on a timed set row: tap to start, tap to stop, elapsed
  seconds land in the field. Typing still works.
- **Duration is entered and stored as whole seconds.** `"1:30"` parses on desktop, but
  the field itself is numeric so the iOS keypad works; an m:ss hint appears beside it at
  ≥ 60s, mirroring the existing `PlateHint` under Weight.

### Out of scope

- Distance-based carries (a carry is logged by time here)
- Prescribed targets / countdown-to-target, and routines or templates
- L/R durations
- Per-set notes, fitness agent tools, Apple Health

## Acceptance criteria

- [ ] A catalog exercise declares **Reps**, **Time**, or **Reps + hold**; existing
      exercises keep behaving exactly as before with no migration of their rows.
- [ ] A `time` exercise logs a duration-only set; a `reps_and_time` exercise logs reps
      and an optional hold, blank hold allowed per set.
- [ ] Weight still records on timed sets wherever `usesWeight(equipment)` is true.
- [ ] History labels read `Plank 3×45s BW`, `Farmer's Carry 3×0:45 @ 50 lb`,
      `Push-up 3×10 + 20s BW`.
- [ ] A stopwatch on a timed set row fills the field with whole elapsed seconds; only one
      runs at a time and none survives the drawer closing.
- [ ] A second user cannot read, change or delete the first user's timed exercise or
      session.

## Changes from original plan

Material refinements during implementation (requirements, design, scope). Omit pure
code polish.

| #   | Change                      | Why |
| --- | --------------------------- | --- |
|     | _(filled during implement)_ |     |

## Task 1: Save spec documentation

Create this folder with `plan.md` (**Status: active**), `shape.md`, `standards.md`,
`references.md`. No visuals.

## Task 2: Schema and migration

`src/db/schema.ts`:

- `exerciseMeasureEnum = pgEnum("exercise_measure", ["reps", "time", "reps_and_time"])`,
  declared next to `exerciseEquipmentEnum` with a comment saying it is orthogonal to
  equipment.
- `exercises.measure` — `notNull().default("reps")`.
- `workoutSets.durationSeconds` — `integer("duration_seconds")`, nullable, commented as
  hold/carry time that is independent of reps so a set can be both.
- A check that `duration_seconds is null or duration_seconds > 0`.

Then `npm run db:generate`, **read the generated SQL**, `npm run db:migrate`. Commit the
`.sql`, the `meta/NNNN_snapshot.json` and the `_journal.json` entry together. No backfill:
the default and the null column leave every existing row correct.

## Task 3: `measure.ts` and `duration.ts` (pure, tested)

**`src/lib/fitness/measure.ts`** — modelled on `equipment.ts`: `MEASURE_OPTIONS`,
`isExerciseMeasure`, `normaliseMeasure` (unknown → `"reps"`), `tracksReps`, `tracksTime`,
and `formatMeasureTag` (`""` | `"Hold"` | `"Reps + hold"`) appended at the two badge call
sites rather than widening `formatEquipmentBadge`'s signature.

**`src/lib/fitness/duration.ts`**: `parseDurationSeconds` (accepts `"45"`, `"1:30"`;
rejects negative, non-integer, `> 24h`, `m:ss` with `ss > 59`), `formatDurationClock`
(`m:ss`), `formatDurationToken` (`"45s"` under a minute, `"1:30"` at or above),
`elapsedSince` (whole seconds, floored, never negative).

Reuse rather than duplicate: `restTimer.ts`'s `formatRestClock` becomes a delegate to
`formatDurationClock`.

## Task 4: Types, `format.ts`, `sessionDraft.ts`

- **`types.ts`:** `ExerciseMeasure`; `measure` on `ExerciseSummary`, `ExercisePrefs`,
  `SessionExerciseView`; `durationSeconds` on `SetInput` and `WorkoutSetView`.
- **`format.ts`:** `normaliseSetInput` normalises the duration; `formatSetsLabel` gains a
  per-set **measure token** — reps-only `"5"` / `"8/6"`, time-only `"45s"`, both
  `"10 + 20s"`, nothing `"?"` — inferred from the row's own null-ness so the signature and
  the `3×token` collapse survive untouched.
- **`sessionDraft.ts`:** `DraftSet.duration`, `DraftExercise.measure`, carried through
  `emptySetForExercise` / `setFromPrevious` / `setsFromHistory` / `draftBlockFromCatalog` /
  `emptyDraftBlock`; `setIsFilled` counts a filled duration. Flatten `draftToSessionInput`'s
  nested per-equipment branches before adding a fourth field to each.

## Task 5: Queries, mutations, integration tests

- `queries.ts` — `mapExercise` maps `measure`; `mapSet` maps `durationSeconds`;
  `getSessionDetail` selects `exercises.measure` so a loaded session renders its columns.
- `mutations.ts` — `prefsToColumns` and `updateExercise` handle `measure`; `insertSets`
  writes `durationSeconds`; the last-resort create in `resolveExerciseId` defaults to reps.
- `mutations.integration.test.ts` — duration-only round trip; `reps_and_time` with a null
  hold on one set; measure surviving `replaceSession`; **a second user failing to read,
  update and delete** the first user's timed exercise and session. Confirm the run did not
  skip.

## Task 6: Exercise editor

`ExerciseEditor.tsx` — a **Measure** select beside Equipment, threaded through the local
`Draft`, `toDraft`, both action calls and both optimistic `onSaved` objects. No coercion
against equipment: the axes are independent.

## Task 7: Session editor — column list, then the Time field

`SetHeader` / `SetRow` are four hand-written grid variants; measure would make twelve.
Derive columns instead: a pure `setColumns({ measure, equipment, unilateral })` returning
ordered `{ key, label, width }` descriptors, preserving today's widths so nothing shifts
for existing exercises, labelled `Time` when time-only and `Hold` in the hybrid. The grid
template becomes an inline `style={{ gridTemplateColumns }}` — Tailwind cannot take a
computed arbitrary value. The Time cell is a numeric input plus a `DurationHint` showing
`m:ss` at ≥ 60s, in the same slot as the existing `PlateHint`.

## Task 8: Hold stopwatch

`HoldTimer.tsx`, following `RestTimer.tsx` — wall-clock `Date.now()` math through
`elapsedSince` with a `setInterval` tick, so backgrounding cannot drift the count. A ⏱
toggle in the Time cell; running, it shows live elapsed in place of the input. **One timer
at a time**, held as a single `{ blockIndex, setIndex, startedAt } | null` in
`SessionEditor`; starting a second row commits the first. Cleared when the drawer closes.
No beep and no `document.title` takeover — a count-up has no end to announce.

## Task 9: Verify, freeze, roadmap

- `npm run test:unit` (check for the DB-skip warning), `lint`, `typecheck`, `build`.
- Dev server up, then **`npm run smoke`**.
- Manually: `Plank` as Bodyweight + Time logged with the stopwatch; `Farmer's Carry` as
  Dumbbell + Time keeping its weight column; a `reps_and_time` exercise with a blank hold
  on set 1; reopen each saved session; confirm an existing reps exercise is unchanged.
- Push to `master` for iPhone validation — timed sets are phone-logged work.
- Complete **Changes from original plan**, mark **Status: frozen / complete**, and extend
  the Fitness bullet in `agent-os/product/roadmap.md`.

---

**Standing rule while this spec is active:** material changes to requirements, design or
scope — including feedback on what was built — go into `plan.md` / `shape.md` and get a row
in **Changes from original plan**. Pure implementation details do not.
