# References for exercise groups

## Governing specs

### `agent-os/specs/2026-07-30-1240-fitness-strength-log/`

- **Relationship:** Extends. Nothing superseded.
- **Relevant decisions:** The catalog / session / sets model and its three lifetimes;
  **history is sacred** — which is why `group_id` is `on delete set null` rather than
  cascade; the session editor **autosaves** with no Save/Cancel, which is why group ids may
  churn on every save; the catalog exercise is the source of truth for how the logger
  renders set fields, which holds per member inside a group.
- **Also relevant:** its "Changes from original plan" row 11 introduced the sticky
  `RestTimer` — a between-set convenience with nothing persisted. This spec adds the first
  persisted rest value, on the group.

### `agent-os/specs/2026-08-20-1115-timed-isometric-exercises/`

- **Relationship:** Extends. Nothing superseded.
- **Relevant decisions:** `measure` as a third catalog axis and `setColumns` as the derived
  seam — a group renders each member's own columns, so a timed carry and a rep exercise can
  share a circuit. Its rule that **a set's shape is inferred from its own nulls rather than
  a declared target** is the direct precedent for deriving round count instead of storing
  it, and its explicit deferral of "prescribed targets" is what this spec must not quietly
  undo.

### `agent-os/specs/2026-08-17-1238-workout-exercise-notes/`

- **Relationship:** Extends. Same seam, no overlap in decisions.
- **Relevant decisions:** Draft mapping belongs in `sessionDraft`, not in the React block;
  per-exercise notes are a collapsed disclosure, editor-only. Round-major layout moves that
  disclosure into the member strip — same behavior, new home.

### `agent-os/specs/2026-08-17-1402-shelve-task-exercise-link/`

- **Relationship:** Context only.
- **Relevant decisions:** Fitness is a fully standalone module; nothing here reaches the
  outline.

## Similar implementations

### Destructive session rebuild

- **Location:** `replaceSession` in `src/lib/fitness/mutations.ts`
- **Relevance:** The transaction groups must be threaded into — delete blocks (cascading
  sets), then groups, then insert groups, capture ids, insert blocks carrying `groupId`.
- **Key patterns:** Order is a pure function of the input array; `sortKey`s are regenerated
  with `between()` from `src/lib/tree/sortKey.ts` on every save, never mutated in place.
  This is why group membership needs no stable identity and why contiguity is guaranteed.

### Derived set columns

- **Location:** `src/lib/fitness/setColumns.ts`
- **Relevance:** Reused **unchanged**. Each group member computes its own column list and
  inline `gridTemplateColumns`; the member label (`A1`) renders into the existing index
  gutter in place of the set ordinal.
- **Key patterns:** Independent axes are composed, not nested — the reason twelve
  hand-written grid variants collapsed into one function. Grouping is a fourth concern that
  deliberately stays outside it.

### Draft-as-text convention

- **Location:** `DraftSet.duration` in `src/lib/fitness/sessionDraft.ts`
- **Relevance:** `DraftGroup.rest` copies it — numeric fields are held as strings in the
  draft so a half-typed value survives a re-render, and are parsed only at
  `draftToSessionInput`.

### Rest timer

- **Location:** `src/components/fitness/RestTimer.tsx`, `src/lib/fitness/restTimer.ts`
- **Relevance:** `onRegisterStart` exists for exactly this and has never been connected —
  the editor renders `<RestTimer />` with no props. Widened here to accept a seconds
  override that runs without overwriting the localStorage preference.
- **Key patterns:** Clock math is pure and in lib; the component stores a wall-clock instant
  and computes from `Date.now()` so backgrounding cannot drift it.

### Hold stopwatch keying

- **Location:** `runningHold` in `src/components/fitness/SessionEditor.tsx`
- **Relevance:** Already keyed `{ blockKey, setIndex }` — member plus round — so it works
  under round-major rendering with no change.
