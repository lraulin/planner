# Timed / isometric exercises — Shaping Notes

**Status: active**

## Scope

Let the Fitness log record work measured in **time** rather than reps: planks, wall sits,
dead hangs, loaded carries — and the hybrid where a set is _X reps then hold for X
seconds_.

The catalog exercise gains a third config axis, `measure` (`reps` · `time` ·
`reps_and_time`), alongside `equipment` and `unilateral`. `workout_sets` gains a nullable
`duration_seconds`. The session logger reads the catalog and puts the matching columns on
the set row, with a stopwatch for capturing the hold.

### Out of scope

- Distance-based carries — a carry is logged by time here
- Prescribed targets, and a countdown-to-target timer
- Routines / templates (still the medium-term roadmap line)
- L/R durations
- Per-set notes, fitness agent tools, Apple Health

## Decisions

- **A third axis on the catalog, not a fourth equipment kind.** `isometric` as an
  equipment value would conflate how a lift is _loaded_ with how it is _measured_, and a
  weighted plank or a loaded carry would lose its weight. `measure` is orthogonal:
  `usesWeight(equipment)` keeps owning the Weight column.
- **Three-value enum, because reps-then-hold is real.** The user named it during shaping:
  push-up with a bottom hold, squat with an isometric pause. `reps_and_time` shows both
  columns.
- **Nullable columns are what make a per-set toggle unnecessary.** A finisher — hold only
  on the last set — is `reps_and_time` with the hold left blank above. Adding a measure
  control to every row would have bought nothing and made Last-time copying and history
  labels ambiguous.
- **One duration per set; unilateral stays reps-only.** A side plank is two sets, which is
  what you physically do. The alternative (`duration_left/right`) put four number fields
  side by side on a phone row for a distinction that is better expressed as two sets.
- **Seconds are the stored and typed unit.** The field is numeric so the iOS keypad
  appears; `"1:30"` still parses for desktop typing, and an m:ss hint appears at ≥ 60s in
  the same slot as the existing plate hint. Labels use `45s` / `1:30`.
- **Derive the set row's columns instead of branching.** `SetHeader` / `SetRow` are
  already four hand-written grid variants; measure would make twelve. A pure
  `setColumns()` returning ordered descriptors kills the combinatorics rather than
  doubling them — the same "one shared implementation per concern" move as DataGrid.
- **Stopwatch counts up, no beep, no tab title.** `RestTimer` already owns the tab title
  and a countdown has an end to announce; a hold does not. Wall-clock math so
  backgrounding the phone cannot drift the count.
- **No backfill.** `measure` defaults to `reps` and `duration_seconds` starts null, so
  every existing row is already correct.

## Context

- **Visuals:** None
- **References:** the parent fitness spec's catalog-drives-the-logger rule; `equipment.ts`
  as the shape to copy for `measure.ts`; `RestTimer.tsx` for the timer pattern;
  `PlateHint` for the sub-field hint; the workout-exercise-notes delta for the same
  `sessionDraft` → `SessionEditor` seam
- **Product alignment:** Extends the delivered Fitness MVP (`roadmap.md`, Phase 3). Not a
  new module and not the medium-term routines work.

## Standards Applied

- **database/migrations** — generate with the snapshot; the three files land in one commit
- **development/testing** — parse/format/column logic pure and tested; integration tests
  for the new column with a second-user case
- **development/clean-code** — mapping in `sessionDraft`, column shape in lib, not in the
  React block; no speculative L/R or distance axes
- **development/security** — every new mutation path still scopes by `userId`
- **components/ux-principles**, **drawer-pattern** — the session drawer and its autosave
- **components/responsive** — the row has to stay usable on the iPhone, which is what
  ruled out L/R durations
