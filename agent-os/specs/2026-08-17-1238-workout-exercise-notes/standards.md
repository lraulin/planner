# Standards for per-exercise workout notes

References only — the files stay canonical.

@agent-os/standards/development/testing.md
@agent-os/standards/components/ux-principles.md
@agent-os/standards/components/drawer-pattern.md
@agent-os/standards/development/clean-code.md

These cover:

- Pure logic in `src/lib/**` with adjacent `*.test.ts`; integration tests for mutations
  (including a second user); no React component tests
- Optional UI stays out of the way until used; inline editing; no extra modal
- Session editor is a drawer that autosaves
- Mapping lives in `sessionDraft`, not in `ExerciseBlock`; no speculative generality
  (no per-set notes, no last-time copy)
