# References for Repeat last titled workout

## Governing specs

### `agent-os/specs/2026-07-30-1240-fitness-strength-log/`

- **Relationship:** Extends the catalog / session / sets model, autosave drawer, and “history is sacred.” Supersedes three decisions: last-time is exercise-anywhere; filled ⇒ completed (default true); empty Log session as the only start.
- **Relevant decisions:** Own tables, never cascade from outline nodes; `replaceSession` rebuilds the session from one flat array; “Last time … tap to copy” and sticky rest timer (changes-from-plan rows 6, 10, 11) are the seams this delta retargets. Routines/templates were explicitly out of scope — this spec is that deferred line, without a template entity.

### `agent-os/specs/2026-08-17-1238-workout-exercise-notes/`

- **Relationship:** Extends. Copy per-exercise notes with the plan; session notes stay day-specific and are not copied.
- **Relevant decisions:** Draft mapping belongs in `sessionDraft`. Last-time still copies sets only (the under-block hint); full-session copy is new and _does_ include `workout_session_exercises.notes`.

### `agent-os/specs/2026-08-20-1115-timed-isometric-exercises/`

- **Relationship:** Extends. Nothing superseded.
- **Relevant decisions:** `measure` drives set columns; duration copies with the plan; current-set highlighting must not assume a reps-only row. Shape is still inferred from a set’s own nulls — `completed` is a separate flag, not a new prescription/target field.

### `agent-os/specs/2026-08-20-1233-exercise-groups/`

- **Relationship:** Extends. Copy groups (label + restSeconds) and keep round-major order. Nothing superseded.
- **Relevant decisions:** Blank interior rounds stay in the array as `completed: false` (sat-out). That remains. A filled unchecked set is planned work, not a sat-out round. Rest after the last member of a round, not after each member. Group structure still does not appear in the history list or Find.

### `agent-os/specs/2026-08-20-1501-rest-timer-notification/`

- **Relationship:** Extends. Rest is a progress cue, never a complete-set signal.
- **Relevant decisions:** Best-effort banner + beep; Fitness-only helper. This spec starts the existing timer from a check (straight sets) in addition to end-of-round. Timer end must not mark the set done.

### `agent-os/specs/2026-08-17-1402-shelve-task-exercise-link/`

- **Relationship:** Context only. Outline task ↔ exercise stays gone. Session title is still not a workout task.

## Similar implementations

### Session draft and completed inference

- **Location:** `src/lib/fitness/sessionDraft.ts` (`draftToSessionInput`, `setsFromHistory`, `setFromPrevious`, `draftFromDetail`)
- **Relevance:** Today `completed: filled[i]` is the “looks finished” bug. `setsFromHistory` already copies numbers without a completed field. `DraftSet` must grow `completed`; copy helpers write false; `draftFromDetail` preserves stored flags.
- **Key patterns:** Numeric draft fields stay strings until parse; group keep-vs-drop is the two-path writer that sat-out rounds depend on — do not collapse it when adding the flag.

### Last-time hint

- **Location:** `src/components/fitness/ExerciseMeta.tsx` (`LastSessionHint`), `src/lib/fitness/queries.ts` (`loadLatestForExercise`, `loadExerciseHistory`)
- **Relevance:** Currently last time this exercise anywhere, excluding the open session. Add optional `sessionTitle`; prefer that, else fall back. Tap still copies through `setsFromHistory` (now unchecked).
- **Key patterns:** Client fetches via `loadLatestForExerciseAction`; hint is a fact about the exercise, so in a group it stays in the member strip.

### Exercise combobox

- **Location:** `src/components/fitness/ExercisePicker.tsx`, `src/lib/fitness/exerciseMatch.ts`
- **Relevance:** Title autocomplete should be the same interaction family (type to filter, Escape does not close the drawer). Matching logic for titles is simpler (trim, case-insensitive, used titles only) and belongs in lib.
- **Key patterns:** Window-capture Escape before the drawer’s document-capture listener.

### Fitness start and history list

- **Location:** `src/components/fitness/FitnessView.tsx`, `src/lib/fitness/routes.ts`, `src/app/fitness/sessions/`
- **Relevance:** `fitness.log-session` opens `/fitness/log` empty (or `?exercise=` from the catalog). Add `?from=<sessionId>` for copy; title cards and Start last live on the sessions page above the chronological list. Do not add a third Fitness page.
- **Key patterns:** URL owns editor state so reload keeps the open log; first autosave pins `/fitness/log` → `/fitness/sessions/:id`.

### Rest timer hook

- **Location:** `src/components/fitness/RestTimer.tsx`, `src/lib/fitness/restTimer.ts`, `SessionEditor` `restStartRef`
- **Relevance:** Groups already call `restStartRef` from `addRound`. Straight-set complete should use the same hook. Copy should say resting for the next set.
- **Key patterns:** Clock math is pure in lib; component holds a wall-clock instant.

### Set row

- **Location:** `src/components/fitness/SetRow.tsx`, `src/lib/fitness/setColumns.ts`
- **Relevance:** Shared by straight blocks and group members. Upcoming/current/done styling and the complete control belong here (plus group member rows), driven by a lib-computed current target — not a second grid.

### Destructive session rebuild

- **Location:** `replaceSession` in `src/lib/fitness/mutations.ts`
- **Relevance:** Copy creates a _new_ session; it must not go through replace on the source. Resume opens the existing id and keeps autosave-as-replace.

### Cross-user read sweep

- **Location:** `src/lib/db/crossUserReads.integration.test.ts`
- **Relevance:** `listRepeatableTitles` and `latestSessionByTitle` are new list/get queries and must be registered so a dropped `userId` cannot hide.
