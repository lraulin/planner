# Per-exercise notes on workout sessions — Shaping Notes

**Status: frozen / complete** (2026-08-17)

## Scope

Expose the already-stored optional note on each exercise in a workout session — “that lift,
that day” — as a collapsed-when-empty field in the session editor.

### Out of scope

- Catalog `exercises.notes` (already in the exercise editor)
- Session-level `workout_sessions.notes` (already at the bottom of the log)
- Per-set notes
- Showing or copying the note on Last-time
- Session list labels or exercise history snippets
- Markdown
- Schema / migration
- Fitness agent tools

## Decisions

- **Finish a planned field, don’t invent a new one.** The parent spec already named
  `workout_session_exercises.notes`. Mutations persist it; the editor never mapped it.
- **Editor only.** Last-time still copies sets. Notes are that day’s thought, not a
  prescription to reuse.
- **Collapsed when empty.** Most blocks never need a note; don’t spend vertical space on a
  blank textarea. Starts open when the stored note has text. Collapse is not persisted.
- **Lightweight disclosure** under `+ Add set`, not the detail-form `Section`.
- **Switching the catalog exercise** starts a fresh empty note.
- **No roadmap bullet.** Fitness MVP is already marked delivered.

## Context

- **Visuals:** None
- **References:** Parent fitness spec; `sessionDraft` / `SessionEditor` as the gap;
  RecurrenceFields collapse-when-empty as UX precedent (not the component)
- **Product alignment:** Polish on the existing Fitness log, not a new Phase 3 item

## Standards Applied

- **development/testing** — draft mapping in lib with unit tests; integration for persist /
  replace / isolation
- **components/ux-principles** — optional field stays out of the way until used
- **components/drawer-pattern** — session editor autosave
- **development/clean-code** — mapping in `sessionDraft`, not in the React block
