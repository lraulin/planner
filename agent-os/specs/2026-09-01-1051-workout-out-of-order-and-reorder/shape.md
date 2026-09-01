# Lift in any order; reorder the exercises — Shaping Notes

**Status: frozen / complete** (2026-09-01)

## Scope

Let a repeated workout be performed in whatever order the gym allows, and let the order itself
be changed.

The trigger, in Lee's words:

> Since we now have a system for repeating workouts, I should be able to rearrange the
> exercises. When I try to do an exercise other than the first when the first one isn't
> completed, it keeps trying to force me to go back to the first one.

Two coupled problems, one spec:

1. **Out-of-order work is fought.** The bench is taken, so today starts with C. The drawer
   scrolls back to A on every keystroke, names A in the sticky header, fetches A's last-time
   numbers, rests for A, and dims the row actually being worked.
2. **The order cannot be changed.** There are no reorder controls at all, so a template whose
   order is wrong stays wrong every week.

### Out of scope

- Drag-to-reorder, desktop or touch
- Reordering members inside a superset or circuit
- A "jump to current set" control
- Moving an exercise into or out of a group as part of a move
- Any change to resume-vs-copy, to what completion means, or to the rest rules

## Decisions

Shaping questions, in order:

- **Which reading of "rearrange"?** Both. Working out of order without being fought _and_
  moving an exercise up or down. Offered as three scopes; Lee took both.
- **Fix the paint or the model?** The model. Four surfaces are wrong from one cause — no concept
  of the active exercise. Guarding the scroll effect alone would stop the yank and leave the
  header, the rest cue and the dimming lying about where the lifter is.
- **Active by set or by block?** By block, keyed by `DraftExercise.key`. A pinned set index goes
  stale the moment it is checked, and any index goes stale the moment something is reordered or
  removed. A block key survives both, and the set within it is derived exactly as before.
- **Does out-of-order change the default?** No. With nothing active the resolution is today's
  first-incomplete-in-session-order, so the ordinary workout is untouched. The active key is an
  override, not a replacement — which is what keeps this a small delta on a frozen spec.
- **Reorder UI?** Always-visible `↑` / `↓` next to the A/B/C letter. The page-bar Rearrange mode
  (`2026-08-31-0758`) exists because navigation and drag collided on one element; nothing
  competes for that spot in the log drawer, so the mode would be ceremony. `responsive.md`
  requires the buttons regardless, and drag was already out of scope in the spec this extends.
- **Reorder inside a group?** No. Members are performed round-major, so their order barely
  shows, and whole-item moves keep the contiguity invariant trivial.
- **Does a reorder stick?** Yes, unavoidably and deliberately: array order becomes `sortKey` on
  the next autosave, and the next start of that title copies the latest session. Reordering
  today is how next week's Push gets fixed. Worth stating in the spec rather than discovering.
- **Visuals?** None provided.

## Context worth keeping

`sameSetTarget` (`currentSet.ts:15`) was written to stop the scroll effect from re-firing on an
identity change and was never wired up. That is the shape of the original bug: the guard was
foreseen, and the effect that needed it should not have been a reaction to derived state in the
first place. Decision 4 removes the reaction rather than adding the guard back.
