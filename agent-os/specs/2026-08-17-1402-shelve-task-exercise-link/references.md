# References for shelving the task ↔ exercise link

## Governing specs

### `agent-os/specs/2026-07-30-1240-fitness-strength-log/`

- **Relationship:** Extends the catalog + session log; supersedes the outline
  “plan reminder” (`task_details.exerciseId`, Task form Fitness strip)
- **Relevant decisions that carry forward:** History is a Notes-class domain; deleting a
  node never cascades into sessions; exercise delete is blocked when history exists;
  Fitness tab is the logger
- **Decision this replaces:** Outline grain = one task per lift, optional FK, last-activity
  strip + “Log workout” deep-link from the task drawer

### `agent-os/specs/2026-08-17-1238-workout-exercise-notes/`

- **Relationship:** Unrelated — per-exercise session notes stay
- **Leave alone:** `workout_session_exercises.notes`, session editor disclosure

### `agent-os/specs/2026-08-05-1458-remaining-go-menu-modules/`

- **Relationship:** Historical only. Contacts modeled `task_details.contactId` on the
  then-existing `exerciseId` precedent. Do not edit that frozen spec.

## Similar implementations

### Task form Details tab

- **Location:** `src/components/detail/TaskForm.tsx`, `src/components/fitness/TaskFitnessPanel.tsx`
- **Relevance:** The only UI for the link. Delete the panel; leave `TaskContactPanel`.

### Detail allowlist

- **Location:** `src/lib/detail/mutations.ts` `TASK_KEYS`
- **Relevance:** Hand-written list tested against every `task_details` column. Dropping
  the column without dropping the key (or the reverse) fails that test.

### Fitness empty state

- **Location:** `src/components/fitness/FitnessView.tsx`
- **Relevance:** Copy still explains the outline-task split as if the link exists.
