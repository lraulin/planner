# Repeat last titled workout — Shaping Notes

**Status: frozen / complete** (2026-08-31)

## Scope

Make repeating a named workout the primary Fitness start, without a template library.

Lee already has history rows with identical titles and no first-class routine. The MVP
explicitly deferred “Push Day templates.” This delta _is_ that medium-term roadmap line,
implemented as: copy (or resume) the last session with that title, and stop treating
prefilled numbers as work already done.

Two coupled problems, one spec:

1. **Start.** Empty “Log session” is the only start. Title is a free-text field. Repeating
   Push means rebuilding it or tapping Last-time on each lift.
2. **Looks finished.** `workout_sets.completed` defaults true and `draftToSessionInput`
   sets `completed: filled[i]`. Copied numbers look like a finished workout at minute zero.

### Out of scope

- First-class `workout_routines` table, Routines tab, detect-after-3-repeats
- Finish keep-vs-update / a plan pointer separate from latest session
- Prev column per set; “copy as reference only”
- Grouped history with diffs; start from an older version of the same title
- Named skip (leave the set unchecked)
- Folders, programs, sharing, auto overload, charts, scheduling, a second template editor
- Drag-to-reorder, Goal/Result Area fitness surfaces, Apple Health, cardio, agent tools

## Decisions

Shaping questions, in order:

- **How far?** Copy last titled session — not a plan pointer, not the full research list.
  Next start is always the latest session with that title. Skipping curls today _does_ drop
  them from next time unless they are added back. That is the accepted cost of no pointer.
- **Autocomplete’s role?** The title field is a combobox of used titles; picking one on an
  empty draft copies last time. Recent titles also appear as one-tap cards with days-ago.
  Empty workout remains the escape hatch. History rows get Start again.
- **Visuals?** None. Describe Strong/Hevy-style plan-vs-done against the existing drawer.
- **Completion on every log, or repeats only?** Every live session. Prefill (from a titled
  copy or from `+ Add set`) writes planned numbers with `completed=false`. Only a check
  logs it. “Copy as reference only” waits.
- **Governing specs?** Delta on the Fitness log as listed in `references.md`. Confirmed.
- **Product?** This _is_ the Phase 3 medium-term routines/templates item, delivered as
  do-again-from-history, not a library. Goal/Result Area surfaces stay later.

Further locks from the “already finished” follow-up:

- Three states: upcoming / current / done. Current is derived (first incomplete, round-major
  in a group). A fully completed history session has no current set.
- Completion is a tap, never an inference. Uncheck is easy. Rest ending ≠ set done.
- Default copy mode: structure + target numbers, nothing checked.
- Resume rather than clone when the latest session for that title is still incomplete.

### Why no template table

A pointer (title → canonical session) is what would make “just this time” vs “use this next
time” real. That was offered and declined for this slice. The latest session _is_ the plan.
Templates can still be introduced later by promoting that latest session; history does not
have to be migrated.

### Why `completed` must change in lib, not only CSS

The column already exists. The writer infers it from filled fields, and the DB default is
true. Painting checks empty while the draft still saves `completed: true` would lie on
reload. Flip the default, stop inferring, persist the tap.

Group sat-out rounds already use `completed: false` for a _blank_ kept set. That meaning
stays. A filled unchecked set is the new meaning (planned). History labels already hide
incomplete sets, so an abandoned copy showing “—” is honest.

## Context

- **Visuals:** None
- **References:** Fitness session drawer, `sessionDraft`, `workout_sets.completed`,
  `ExercisePicker` as the combobox to echo, `loadLatestForExercise`. See `references.md`.
- **Product alignment:** `agent-os/product/roadmap.md` Phase 3 Fitness tracker, medium-term
  “routines/templates.” Mission is personal Achieve plus extra modules; Fitness is not
  AP-faithful. `docs/achieve-planner/` does not govern this.

## Standards Applied

- `development/testing` — copy, current-set, title match, completion flag in `src/lib/fitness`; integration with a second user failing to read/copy/start the first user’s sessions
- `development/security` — every new query/mutation takes `userId`; register reads in `crossUserReads`
- `database/migrations` — `completed` default false; generate + snapshot; no backfill
- `components/responsive` — 44px complete control; do not override the 16px input rule
- `components/ux-principles` + `drawer-pattern` — one autosave drawer; complete is inline, not a modal
- `components/navigation` — `fitness.start-last-session` in the New menu; title cards are page data
- `development/clean-code` — copy/current-set/title logic in lib, not `SessionEditor`
- `development/commits` — one logical change per commit; Spec trailer
