# References for Lift in any order; reorder the exercises

## Governing specs

### `agent-os/specs/2026-08-31-1412-fitness-repeat-from-title/`

- **Relationship:** Extends, and supersedes decision 7 only.
- **Relevant decisions:** Decision 7 defines current as "first incomplete set in session order",
  which is precisely what fights out-of-order work; this delta narrows it to the active exercise
  first, session order as the fallback. Decision 9 (rest after a check, never after the last
  remaining set, never mid-round in a group) is unchanged but now reads from the resolved
  current. Decision 11 (sticky "{exercise} — Set N of M", `done / total`) is unchanged and
  becomes correct once the pointer follows the lifter. Decision 3 (resume vs copy) and decision 8
  (completion is a tap) carry forward untouched. Its Out-of-scope line "Drag-to-reorder" is
  reopened as button reorder; drag itself stays out.

### `agent-os/specs/2026-08-20-1233-exercise-groups/`

- **Relationship:** Extends. Nothing superseded.
- **Relevant decisions:** Members of a group are contiguous in the flat array, which is why the
  group has no sort key of its own — so a move must travel the whole run or the group silently
  splits. Round-major order within a group is what makes "the active item" a group rather than a
  member. Rest waits for the last member of a round.

### `agent-os/specs/2026-07-30-1240-fitness-strength-log/`

- **Relationship:** Extends. Nothing superseded.
- **Relevant decisions:** One autosaving session drawer; `replaceSession` rebuilds the session
  from one flat ordered array, which is what makes reorder free of any new mutation; history is
  sacred, and a reorder of a live session is an edit to that session, not to history.

### `agent-os/specs/2026-08-31-0758-page-bar-arrange-mode/`

- **Relationship:** Interaction sibling, not governing.
- **Relevant decisions:** Do not arm a gesture permanently on a control whose primary action is
  something else; a reorder that a phone cannot reach is not shipped. Considered and not
  followed here: the mode exists because navigation and drag collided on one element, and
  nothing competes for the header spot in the log drawer.

## Similar implementations

### Current-set resolution

- **Location:** `src/lib/fitness/currentSet.ts` (`currentSetTarget`, `currentSetCue`,
  `restAfterComplete`, `setRowRole`)
- **Relevance:** The single point all four wrong surfaces read from. The per-item scan inside
  `currentSetTarget` is the piece to extract as `firstIncompleteInItem` so the active item and
  the fallback share it.
- **Key patterns:** `sameSetTarget` (`:15`) is dead in production — it was written for the guard
  decision 4 makes unnecessary. `restAfterComplete` already distinguishes mid-round from
  end-of-round; that branch stays as it is.

### Group folding

- **Location:** `src/lib/fitness/sessionGroups.ts` (`groupSessionItems`, `itemLetter`)
- **Relevance:** The item list is the unit a move operates on; folding runs of consecutive
  members is what a move must not break, and re-lettering after a move is already free.
- **Key patterns:** A non-contiguous group degrades into two groups rather than reordering the
  workout — so a bad move corrupts the reading of the session silently. Test contiguity directly.

### Grouping edits

- **Location:** `src/lib/fitness/groupEdit.ts` (`joinWithNext`, `joinWithPrevious`, `ungroup`,
  `removeMember`, `pruneGroups`)
- **Relevance:** The home for `moveItem`. Every operation there either preserves contiguity or is
  a no-op, and its tests are written against that invariant.
- **Key patterns:** Operations take and return a whole `Grouping`; out-of-range input returns the
  draft unchanged rather than throwing.

### The session drawer

- **Location:** `src/components/fitness/SessionEditor.tsx` (`:167` current target memo, `:208`
  scroll effect, `:588` sticky cue, `toggleComplete`, `updateSet`, `setGroupingAndSave`)
- **Relevance:** Every wiring change lands here. The block header at `:856` and the group header
  in `ExerciseGroupBlock.tsx:112` share a shape — letter chip, control, small text buttons — so
  the `↑` / `↓` pair goes in the same place in both.
- **Key patterns:** `runningHold` is already keyed by `blockKey` rather than index, which is the
  precedent for keying the active exercise the same way. `exerciseEditor.blockIndex` is an index,
  but that drawer is open over the log and cannot be reordered behind.

### Order persistence

- **Location:** `src/lib/fitness/mutations.ts:298` (`between` from `src/lib/tree/sortKey`),
  `src/lib/fitness/queries.ts` (`orderBy(asc(sortKey))`)
- **Relevance:** `sortKey` is regenerated from array position on every save, so a reorder needs
  no migration, no new column and no new mutation — and it reaches next week through the
  repeat-from-title copy, which reads in `sortKey` order.
