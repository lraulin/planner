# Timed / isometric exercises

**Status: frozen / complete** (2026-08-20)  
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

- [x] A catalog exercise declares **Reps**, **Time**, or **Reps + hold**; existing
      exercises keep behaving exactly as before with no migration of their rows.
- [x] A `time` exercise logs a duration-only set; a `reps_and_time` exercise logs reps
      and an optional hold, blank hold allowed per set.
- [x] Weight still records on timed sets wherever `usesWeight(equipment)` is true.
- [x] History labels read `Plank 3×45s BW`, `Farmer's Carry 3×0:45 @ 50 lb`,
      `Push-up 3×10 + 20s BW`.
- [x] A stopwatch on a timed set row fills the field with whole elapsed seconds; only one
      runs at a time and none survives the drawer closing.
- [x] A second user cannot read, change or delete the first user's timed exercise or
      session.

## Changes from original plan

Material refinements during implementation (requirements, design, scope). Omit pure
code polish.

| #   | Change                                                                                      | Why                                                                                                                                                                                        |
| --- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `setColumns` got its own module rather than living in `measure.ts`                          | It is about the editor row's shape, not about the measure concept. Small single-purpose modules, per `clean-code`.                                                                         |
| 2   | The badge says **Hold** where the catalog select says **Time**                              | The catalog asks what a lift is measured in; the badge says what you will be doing. "Bodyweight · Time" reads worse than "Bodyweight · Hold".                                              |
| 3   | The unilateral checkbox is replaced by a one-line note when the exercise measures time only | The control would have done nothing there. Saying "left and right is a reps setting; log each side as its own set" puts the shaping decision where someone looks for it on a side plank.   |
| 4   | Closing the drawer drops a running hold instead of recording it                             | Committing it would have raced the autosave flush — `setBlocksAndSave` queues through a setState updater that may not run before `flush()`. A hold you never stopped is not a set you did. |
| 5   | Clock reads (`Date.now`) moved to module-scope helpers                                      | `react-hooks/purity` rejects them inside a component, and the first attempt genuinely was wrong: it called `commitHold` from inside a `setRunningHold` updater, which must be pure.        |
| 6   | `formatSetsLabel` infers a set's shape from its own nulls rather than taking `measure`      | Keeps the existing signature and the `3×token` collapse untouched, and renders history correctly for sets logged before the exercise was reconfigured.                                     |

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

## Verification (2026-08-20)

- 2877 unit tests and the full integration suite against real Postgres — the fitness
  integration file ran 17 tests with no skip warning.
- `lint`, `typecheck`, `build`, and `npm run smoke` across all 57 routes.
- Driven in the browser: `Plank` (Bodyweight + Time) logged `15s, 1:30 BW` with the
  stopwatch writing 15 s into the field and the `1:30` hint appearing only past a minute;
  `Farmer's Carry` (Dumbbell + Time) logged `1×1:00 @ 50 lb` with the weight column intact;
  `Push-up with bottom hold` (reps + hold) logged `10, 10 + 20s BW` with the hold blank on
  set 1. Each session reopened with its columns and values. Existing reps exercises were
  byte-identical throughout.
- Every probe row was deleted afterwards; the dev database is exactly as it was found.

## Follow-ups (new work — not amendments to this frozen spec)

- The exercise **picker** label (`formatExerciseSelectLabel`) still shows only equipment,
  so two same-named exercises differing only by measure are indistinguishable in the
  dropdown. The badge under the picker does show it.
- Distance-based carries, prescribed targets with a countdown, and L/R durations remain
  deliberately unbuilt.
- Unrelated and pre-existing: `src/lib/day/mutations.integration.test.ts` >
  "clears descendant plans that fall inside a dated shelf" was failing on today's date
  (confirmed present with this work stashed) and blocked pre-push for everyone. Fixed
  separately in `03351dd` — its hard-coded shelf date had arrived, so a deferral dated
  today had already expired; the days are now derived from today.

---

**Standing rule while this spec was active:** material changes to requirements, design or
scope — including feedback on what was built — go into `plan.md` / `shape.md` and get a row
in **Changes from original plan**. Pure implementation details do not.
