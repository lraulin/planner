# References for per-exercise workout notes

## Governing specs

### `agent-os/specs/2026-07-30-1240-fitness-strength-log/`

- **Relationship:** Extends — this delta surfaces a field that spec already specified
- **Relevant decisions:** `workout_session_exercises.notes` is “optional per-exercise note
  that day”; session log is the system of record; history never cascades from outline
  nodes; session editor autosaves

## Similar implementations

### Session draft converter

- **Location:** `src/lib/fitness/sessionDraft.ts`, `sessionDraft.test.ts`
- **Relevance:** This is the gap. `DraftExercise` has no `notes`; `draftToSessionInput`
  omits them, so the next autosave would wipe a stored note.
- **Key patterns:** Pure conversion; constructors (`emptyDraftBlock`,
  `draftBlockFromCatalog`); set copy helpers stay set-only

### Session editor

- **Location:** `src/components/fitness/SessionEditor.tsx`
- **Relevance:** `draftFromDetail` must copy `ex.notes`; `ExerciseBlock` needs the
  disclosure; `setBlocksAndSave` already queues autosave
- **Key patterns:** Notes-style debounce; Last-time copies sets via `setsFromHistory`

### Mutations / queries already persist the column

- **Location:** `src/lib/fitness/mutations.ts` (`createSession`, `replaceSession`),
  `src/lib/fitness/queries.ts` (`getSessionDetail`), `src/lib/fitness/types.ts`
- **Relevance:** No schema or mutation signature change; `block.notes ?? ""` is already
  written

### Catalog and session notes (contrast — leave alone)

- **Location:** `ExerciseEditor.tsx` catalog notes; session-level textarea at the bottom of
  `SessionEditor`
- **Relevance:** Different lifetime. Catalog = standing cue for the lift; session = whole
  visit; this field = that lift on that day

### RecurrenceFields collapse (UX precedent, not the component)

- **Location:** `src/components/detail/RecurrenceFields.tsx` + `Section` in `fields.tsx`
- **Relevance:** Optional block starts closed when empty, open when it has content
- **Note:** Do not import form `Section` into the gym log — too heavy for that density
