# Shelve task ↔ exercise link

**Status: frozen / complete** (2026-08-17)  
Spec folder: `agent-os/specs/2026-08-17-1402-shelve-task-exercise-link/`

## Spec relationships

- **Extends:** `agent-os/specs/2026-07-30-1240-fitness-strength-log/` — exercise catalog, session log, Fitness tab, history durability
- **Supersedes:** `agent-os/specs/2026-07-30-1240-fitness-strength-log/` — outline task ↔ exercise link (`task_details.exerciseId`, Task form Fitness strip, “plan reminder” concept)

## Context

The Fitness MVP split three ideas: catalog exercise, outline **plan reminder** (a task with `exerciseId`), and session log. The reminder was cheap and matched “special task” intent without a new node type.

In use, plan rows are things like **Push Day**, not Bench Press. The per-lift link does not match how the outline is actually used, so it sits unused on the Details tab. Designing a better join (session title as a workout task, or Goal-level progress) is real work and not needed now. Tasks stay reminders of what to do; Fitness stays the record of what was lifted.

Do not leave a half-baked FK and panel in the app.

## Decisions

- **Remove the feature completely.** Drop the column, the form strip, and the allowlist entry. Do not hide the UI and keep a dead `exercise_id`.
- **Fitness stays a standalone module.** Catalog, sessions, sets, last-time copy, plate math, per-exercise session notes — all unchanged.
- **`/fitness/log?exercise=` stays.** That is Fitness-internal (open the logger pre-seeded from the catalog). It is not an outline deep-link.
- **`ExercisePicker` stays.** Session editor still uses it.
- **No replacement integration in this spec.** Session-title-as-task, Goal/Result Area fitness surfaces, routines/templates — later work if wanted. Medium-term roadmap already names Goal / Result Area progress; this spec does not start it.
- **Do not rewrite frozen or as-built historical specs.** Contacts still cite `task_details.exerciseId` as the precedent for `contactId`; that was true when Contacts shipped. The original fitness spec stays the record of what was built then. This delta is the later decision.
- **Existing linked rows (if any) are discarded** when the column drops. Personal single-user data; the feature is unused.

## Acceptance criteria

- [x] Task drawer Details tab has no Fitness / linked-exercise control. Contact panel is unchanged.
- [x] `task_details` has no `exercise_id`. `TASK_KEYS` still matches remaining columns.
- [x] Fitness catalog + session log still create, edit, and delete as before.
- [x] The “keeps history when a linked task is deleted” test is gone; remaining fitness isolation / history tests still pass.
- [x] Roadmap no longer advertises the outline link as part of the shipped MVP.
- [x] typecheck, lint, unit tests green; integration tests run (Postgres up). Smoke the task drawer and Fitness after `src/app` / form changes.

## Changes from original plan

Material refinements during implementation (requirements, design, scope). Omit pure
code polish.

| #   | Change        | Why                                                                |
| --- | ------------- | ------------------------------------------------------------------ |
| 1   | None material | Removed the unused FK and panel as shaped; Fitness log left alone. |

## Task 1: Save Spec Documentation

Create this folder with `plan.md`, `shape.md`, `standards.md`, `references.md`. Status: active.

While this spec is **active**, material requirement/design/scope changes update the folder
and **Changes from original plan**. Skip pure implementation details.

## Task 2: Schema + migration

In `src/db/schema.ts`:

- Remove `task_details.exerciseId` and its comment.
- Reword the `contactId` comment so it no longer points at `exerciseId` (keep the load-bearing bit: task-only FK, `set null`, not on `nodes`).

Then `npm run db:generate`, read the SQL (expect `DROP CONSTRAINT` + `DROP COLUMN "exercise_id"` on `task_details` only — not the session-exercise column), `npm run db:migrate`. Commit SQL + snapshot + journal together.

## Task 3: Tear out the UI and allowlist

- Delete `src/components/fitness/TaskFitnessPanel.tsx`.
- `TaskForm.tsx`: drop the import and the Details-tab `<TaskFitnessPanel />`. Leave `TaskContactPanel` and the rest of Details.
- `src/lib/detail/mutations.ts`: remove `"exerciseId"` from `TASK_KEYS`.
- `src/lib/agent/detailArgs.ts`: drop `exerciseId` from the free-text comment.
- `src/lib/fitness/types.ts`: drop the outline-link sentence from the file comment.
- `FitnessView.tsx` empty state: stop saying history lives “not on outline tasks.” Something like “Log sets and reps so the next session has last time’s numbers.”

## Task 4: Tests

- Remove `keeps history when a linked task is deleted` from `src/lib/fitness/mutations.integration.test.ts` (and its `createNode` / `saveNodeDetail` / `deleteNode` imports if they become unused). Do not replace it with a “delete an unrelated task” test — that would not fail on a plausible mistake.
- `TASK_KEYS` coverage test updates itself from the schema.
- Session-level `exerciseId` tests stay (catalog FK on `workout_session_exercises`).

## Task 5: Roadmap + verify + freeze

- `agent-os/product/roadmap.md` Fitness short-term: catalog + sessions + Fitness tab; history is its own domain. No outline link. Medium-term Goal / Result Area line unchanged.
- `npm run test:unit`; run integration (confirm no skip warning).
- Browser: open a task → Details has no Fitness section; Fitness still logs a session.
- After `src/app` or route-touching edits: `npm run smoke` with the dev server up. This change is mostly components/lib/schema; still hit the task drawer and `/fitness` by hand.
- Freeze the new spec. Do not freeze or rewrite the original fitness folder in this pass.

## Follow-ups (new work — not amendments to this frozen spec)

- Goal / Result Area fitness progress, if a join is ever wanted
- Session title as a workout task — only if a later design makes that grain useful
- The original fitness spec is still marked **active** despite being delivered; freeze it
  as historical in a housekeeping pass, do not reopen it to undo this delta
