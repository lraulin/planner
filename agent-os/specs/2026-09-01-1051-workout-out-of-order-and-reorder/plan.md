# Lift in any order; reorder the exercises

**Status: frozen / complete** (2026-09-01)
Spec folder: `agent-os/specs/2026-09-01-1051-workout-out-of-order-and-reorder/`

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-31-1412-fitness-repeat-from-title/` — resume-vs-copy, explicit completion, three set states, rest-after-round. All carry forward.
- **Supersedes:** `agent-os/specs/2026-08-31-1412-fitness-repeat-from-title/` — decision 7 only, "Current = first incomplete set in session order." Current is now the first incomplete set of the **active** exercise, falling back to session order when nothing is active. This also reopens that spec's "Drag-to-reorder" out-of-scope line as _button_ reorder; drag itself stays out.
- **Extends:** `agent-os/specs/2026-08-20-1233-exercise-groups/` — members stay contiguous; round-major within a group; rest after a round, not after each member.
- **Extends:** `agent-os/specs/2026-07-30-1240-fitness-strength-log/` — one autosaving session drawer, destructive replace-rebuild on save, history is sacred.

Achieve Planner has no fitness module; `docs/achieve-planner/` does not govern this.

## Context

Repeat-from-title made a named workout a real thing that comes back every week in a fixed
exercise order. Two things follow that the log drawer does not allow: doing the lifts in a
different order today, and changing the order for good.

The drawer fights both. "Current set" is a _derived position_ — the first incomplete set in
list order (`src/lib/fitness/currentSet.ts:33`) — with no notion of where the lifter actually
is, and four surfaces obey it:

1. `SessionEditor.tsx:208` scrolls the current set into view on every change of `currentTarget`.
   That memo (`:167`) recomputes from `blocks`, which gets a new identity on every keystroke, so
   `currentSetTarget` returns a fresh object each time and the effect re-fires. Typing a weight
   into exercise C smooth-scrolls back to exercise A. (`sameSetTarget` at `currentSet.ts:15` was
   written to stop exactly this and is never called in production.)
2. The sticky header (`:588`) keeps naming exercise A, and the "Last time:" lookup (`:176`)
   fetches history for A rather than for the lift being done.
3. Checking a set in C starts the rest timer captioned for A (`restAfterComplete`,
   `currentSet.ts:97`).
4. Every row being worked is dimmed to `opacity-55` as "upcoming" (`SetRow.tsx:212`); only the
   derived first-incomplete row gets `current` styling.

One cause, four symptoms: the model has no concept of the **active exercise**. Guarding the
scroll effect would stop the yank and leave the header, the rest cue and the dimming lying.

There are also no reorder controls at all. Order _is_ persisted — `workout_session_exercises
.sortKey`, regenerated from array order at `mutations.ts:298` — and repeat-from-title copies the
latest session in that order, so a reorder today carries into next week's Push for free.

## Decisions

1. **The active exercise is a block, not a set.** `SessionEditor` holds
   `activeBlockKey: string | null`, keyed by `DraftExercise.key` and never by index, so it
   survives reorder and removal. Transient component state — never persisted, never part of the
   draft, so it cannot trigger autosave. Closing and reopening the drawer starts from the first
   incomplete set, as it does today.
2. **Touching a set makes its block active.** Editing any field, checking or unchecking,
   starting a hold, adding a set, or copying last time sets `activeBlockKey` to that block.
   Nothing else does — selecting an exercise or editing notes leaves it alone.
3. **Current resolves within the active item first.** `currentSetTarget(exercises, groups,
activeKey?)` finds the item (a straight exercise, or the whole group) containing `activeKey`
   and returns its first incomplete set, round-major inside a group. If that item has no
   incomplete set left, or the key is gone, it falls through to the existing scan in session
   order. With no active key the behavior is exactly today's, so the in-order flow is unchanged.
4. **Scrolling is an action, not a reaction.** Delete the `[open, currentTarget]` effect. Scroll
   the current set into view on exactly two events: opening the drawer, and auto-advancing after
   a check. A `pendingScroll` state set at those two points, consumed and cleared by an effect.
   No recompute of `currentTarget` can move the viewport again.
5. **The header, rest cue and highlight all read the resolved current.** One change fixes all
   four symptoms: the sticky "{exercise} — Set N of M", the "Last time:" fetch,
   `restAfterComplete`, and `current` vs `upcoming` row styling. Finishing the active exercise
   rests for whatever the fallback picks next, which is the natural advance.
6. **Reorder moves whole items.** `↑` / `↓` beside the A/B/C letter on each exercise and group
   header, disabled at the ends, with `title` tooltips and 44px taps. A group moves with all its
   members. Members are not reorderable within a group — round-major makes their order nearly
   moot, and it keeps the contiguity invariant trivial to prove.
7. **No drag.** `responsive.md` disables drag below `md` and requires any ranking drag provides
   to exist as an explicit command regardless. Desktop drag stays out of scope, as it was in the
   spec this extends.
8. **Reorder persists, therefore it repeats.** No new mutation: the array order becomes `sortKey`
   on the next autosave, and next week's copy of that title starts in the new order. Recorded
   because it is the point, not a side effect.

### Out of scope

- Drag-to-reorder (desktop or touch)
- Reordering members inside a group
- A "jump to current set" control
- Moving an exercise into or out of a group as part of a move
- Any change to resume-vs-copy, to what completion means, or to the rest rules

## Acceptance criteria

- [x] With exercise A untouched, typing into a set of exercise C does not scroll the drawer.
- [x] Working C makes C current: the sticky header names C, "Last time:" is C's history, C's row
      is highlighted rather than dimmed, and checking a C set rests for C's next set.
- [x] Finishing every set of C advances to the first incomplete set elsewhere, in session order.
- [x] Never working out of order behaves exactly as before: open lands on the first incomplete
      set, checking advances to the next, rest starts on the same rules.
- [x] A group member being active makes the group active: round-major still governs, and rest
      still waits for the last member of the round.
- [x] `↑` / `↓` reorder exercises and whole groups; the ends are disabled; a group's members stay
      contiguous; the A/B/C letters recompute.
- [x] The new order survives close and reopen, and starting the same title next time begins in it.
- [x] Cross-user: a second user cannot read, reorder, or save over another user's session.
- [x] Logic in `src/lib/fitness/**` with adjacent unit tests; no React component tests.
      `npm run test:unit` plus integration with Postgres up (check it did not skip).
- [x] Phone: reorder taps are 44px, the active exercise is obvious in one second.

## Changes from original plan

Material refinements during implementation (requirements, design, scope). Omit pure code polish.

| #   | Change                                                                                                              | Why                                                                                                                                                                                                                                                                          |
| --- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Decision 4's `pendingScroll` is a ref plus a bump counter, not a `useState` cleared by the effect.                  | `react-hooks/set-state-in-effect` is an error in this repo, and clearing the state inside the effect that consumed it is exactly the cascading-render shape it forbids. The semantics are unchanged — scroll fires on open and on advancing after a check, and nowhere else. |
| 2   | The `↑` / `↓` pair is a shared `MoveButtons` component in its own file rather than markup repeated in both headers. | `ExerciseGroupBlock` cannot import from `SessionEditor` — `SessionEditor` imports it — so a shared control needs its own module. It also keeps the 44px sizing and the disabled styling in one place.                                                                        |

## Task 1: Save spec documentation

Create this folder with:

- **plan.md** — this plan (**Status: active**), with an empty **Changes from original plan**
- **shape.md** — shaping notes (scope, decisions, context from the conversation)
- **standards.md** — which standards apply, why, and any deviations (references, not copies)
- **references.md** — governing specs and reference implementations studied
- **visuals/** — none provided; omitted

Then stop. Implementation starts in a fresh session at Task 2.

## Task 2: Active-exercise resolution in lib

`src/lib/fitness/currentSet.ts`: extract the existing per-item scan as
`firstIncompleteInItem(item)`, then give `currentSetTarget` an optional third argument
`activeKey: string | null` that tries the item containing that key before falling back to the
scan in session order. `currentSetCue` and `restAfterComplete` take and forward it. Delete
`sameSetTarget` if it is still unused.

Unit tests in `currentSet.test.ts`: active on a later block returns its first incomplete set;
an active block with nothing left falls back to session order; an unknown key falls back; active
inside a group stays round-major across the whole group; `restAfterComplete` rests for the active
block's next set and still returns null mid-round; passing no active key reproduces every
existing case unchanged.

## Task 3: Move items

`src/lib/fitness/groupEdit.ts` — the module that already owns the contiguity invariant. Add
`moveItem(draft: Grouping, itemIndex: number, direction: -1 | 1): Grouping`, operating on
`groupSessionItems` items so a group's whole run travels together. Out of range is a no-op.

Unit tests in `groupEdit.test.ts`: a straight exercise up and down; a group moves with every
member and stays contiguous; a group swapping past a lone exercise; both ends no-op;
`groupSessionItems` re-letters after the move.

## Task 4: Wire the editor

`src/components/fitness/SessionEditor.tsx`:

- `activeBlockKey` state, set in `updateSet`, `toggleComplete`, `startHold`, `addSet` and
  `copyLastSets` (decision 2). Pass it into the three `currentSet` calls.
- Replace the `[open, currentTarget]` scroll effect with `pendingScroll`, set on open and in
  `toggleComplete` after a check.
- `onMoveUp` / `onMoveDown` / `canMoveUp` / `canMoveDown` on `ExerciseBlock` and
  `ExerciseGroupBlock`, calling `setGroupingAndSave((c) => moveItem(c, itemIndex, ±1))`. The
  buttons sit beside the `{letter}` chip in both headers, matching the existing small-button
  styling.

`src/components/fitness/ExerciseGroupBlock.tsx` takes the same two props and renders the pair.
No change to `SetRow` — it already styles from the role it is handed.

## Task 5: Integration and cross-user

Extend `src/lib/fitness/mutations.integration.test.ts`: a reordered exercise array round-trips
through save and reload in the new `sortKey` order, and a second user cannot save over or read
that session. No new mutation is added — reorder rides the existing replace-rebuild update.

## Task 6: Verify

`npm run test:unit`, integration with Postgres up (watch for the skip warning), `npm run lint`,
`npm run typecheck`, then the dev server plus `npm run smoke`. In the browser: start a repeated
title; type into exercise C while A is untouched and confirm no scroll jump; check a C set and
confirm the header, rest cue and highlight all follow C; move C above A and confirm the letters
and the order after reopen. Push to `master` so it can be validated on the phone.

## Task 7: Freeze

Confirm the acceptance criteria, fill **Changes from original plan**, set
**Status: frozen / complete**, and pin the standards commit SHA in `standards.md`. The
repeat-from-title folder is not touched — a frozen spec is never edited; this delta is where the
supersession is recorded.

---

This spec is **frozen**: it is the as-built record of what was decided and why, not a living
control plane. Reference this folder for the reasoning; open a **new delta-spec** for further
change rather than editing anything here.

## Follow-ups (new work — not amendments to this frozen spec)

- Drag-to-reorder on desktop, if buttons ever prove too slow at a keyboard.
- Reordering members inside a group, if round-major ever stops making their order moot.
- A "jump to current set" control, if the active exercise ever ends up off-screen in a long
  session.
