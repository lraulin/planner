# Exercise groups — Shaping Notes

**Status: active**

## Scope

Support supersets, circuits, and mechanical drop sets in the Fitness tracker by modelling
the one structure they share: an ordered **group** of exercises performed back-to-back,
with rest only at the end, repeated for N rounds.

Delivered end to end — schema, queries/mutations, and a round-major logging UI usable
one-handed on the phone mid-workout.

### Out of scope

- **Straight drop sets** (same exercise, drop the weight). Already expressible today, since
  weight is recorded per set — this is not a deferral, it is a non-feature.
- Prescribed targets or countdown-to-target of any kind (carried forward from the timed spec)
- Routines / "Push Day" templates — still the standing medium-term roadmap line
- Drag-to-reorder exercises or groups; no reorder affordance exists in fitness today
- Group structure in the history list, in Find, or on the per-exercise history page
- Per-member rest, per-set notes, EMOM/AMRAP time-domain formats

## Decisions

- **One entity, optional label.** "Superset", "Circuit", "Drop set" are display chrome on a
  single `workout_session_groups` row. Three separate types was considered and rejected: the
  distinctions are member count and round count, both already visible in the data.
- **Rounds are derived, not stored.** `rounds = max(member.sets.length)`. Storing a round
  count would be the fitness module's first prescription field, which
  `2026-08-20-1115-timed-isometric-exercises` explicitly deferred, and would introduce a way
  for the plan to disagree with the log. Unequal member set counts are honest data — you
  bailed on the last round — so the UI must render a gap rather than assume a rectangle.
- **Rest on the group only.** Members are by definition back-to-back; a per-member rest
  field would model something that does not happen.
- **No second ordering keyspace.** A group's position derives from its members' existing
  `sortKey`s, which are contiguous by construction: the draft is a flat ordered array and
  `replaceSession` rebuilds every row from it on each autosave. The read side folds
  _consecutive_ runs of equal `groupId`, so an impossible non-contiguous group degrades into
  two groups rather than corrupting anything.
- **`groupId` is `on delete set null`,** not cascade. Deleting a group ungroups its members;
  it never destroys logged work. "History is sacred" carries forward from the founding MVP.
- **Round-major logging.** Member-major (today's blocks wrapped in a rail) was the cheaper
  option and was rejected: mid-circuit you would scroll between A1 and A2 every round.
  Round-major matches how the work is actually performed, at the cost of re-homing the
  per-exercise notes and the Last-time hint into a member strip above the rounds — they are
  per-exercise facts, and rounds are not.
- **Grouping via "Group with previous / next"** on the block menu rather than drag-and-drop.
  Always yields a contiguous span, and fitness has no drag affordance to extend.
- **Rest timer auto-starts for groups only.** Extending auto-start to ungrouped `+ Add set`
  was offered and declined; that stays manual.

## Context

- **Visuals:** None. Two ASCII layouts were compared during shaping (member-major bracketed
  blocks vs. round-major table); round-major was chosen.
- **References:** `src/lib/fitness/sessionDraft.ts`, `setColumns.ts`, `mutations.ts`
  (`replaceSession`), `src/components/fitness/SessionEditor.tsx`, `RestTimer.tsx`. See
  `references.md`.
- **Product alignment:** Fitness is Phase 3 "Beyond Achieve" in
  `agent-os/product/roadmap.md`; this is a new `✅` line under the tracker, adjacent to but
  distinct from the medium-term routines/templates entry. Achieve Planner has no fitness
  module, so `docs/achieve-planner/` does not govern it.

## Pre-existing loose end fixed here

`RestTimer` has always accepted `onRegisterStart` so the editor could kick the timer, but
`SessionEditor` renders `<RestTimer />` with no props — the hook has never been wired. Task 8
connects it (widened to take a seconds override) as part of making round rest work.

## Standards Applied

- `database/migrations` — new table plus a nullable FK column; generated, never hand-written
- `development/testing` — pure round/folding logic gets adjacent unit tests; the new table
  gets integration tests including a second user attacking the first user's group rows
- `development/clean-code` — folding and round math live in `src/lib/fitness/**`, not in the
  editor; `actions.ts` stays thin
- `development/security` — every mutation takes `userId` and scopes by it
- `components/drawer-pattern` — grouped logging stays inside the existing autosaving drawer
- `components/responsive` — 44px targets and the 16px input rule; this is a one-handed,
  mid-set surface
- `components/ux-principles` — inline editing, no modals for logging
