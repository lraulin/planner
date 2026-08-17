# Shelve task ↔ exercise link — Shaping Notes

**Status: frozen / complete** (2026-08-17)

## Scope

Remove the unused outline task ↔ catalog exercise link. Tasks stay the reminder surface;
Fitness stays the workout log. No replacement integration in this cycle.

### Out of scope

- Session title as a workout task
- Goal / Result Area fitness progress surfaces
- Routines / “Push Day” templates
- Changing the Fitness catalog, session log, last-time copy, or `/fitness/log?exercise=`
- Rewriting the original fitness spec or the Contacts spec that cited this FK as precedent

## Decisions

- Drop the column, not hide the UI. A dead `exercise_id` is the half-baked leftover this
  work exists to avoid.
- Keep Fitness-internal `exercise` query params and `ExercisePicker`. Those are the log,
  not the outline join.
- Leave historical specs as they were when they shipped. This delta supersedes the named
  decision; it does not rewrite the as-built record of 2026-07-30.
- Any existing `task_details.exercise_id` values are discarded with the column. The feature
  is unused.

## Context

- **Visuals:** None
- **References:** Parent fitness spec (plan-reminder decision); Task form Details tab;
  `TASK_KEYS` allowlist; Contacts `contactId` comment
- **Product alignment:** Fitness short-term MVP remains the strength log. Medium-term
  still names Goal / Result Area progress — that is later work, not a substitute for this
  teardown.

## Standards Applied

- **database/migrations** — generate the drop; snapshot + journal travel with the SQL
- **development/testing** — delete the test whose invariant is gone; no component tests
- **development/commits** — one logical change; Spec trailer
- **development/clean-code** — no speculative leftover column
