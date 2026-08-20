# References for timed / isometric exercises

## Governing specs

### `agent-os/specs/2026-07-30-1240-fitness-strength-log/`

- **Relationship:** Extends. Nothing superseded.
- **Relevant decisions:** Three concepts with three lifetimes (catalog / plan / log);
  history is its own domain and never cascades from the outline; **the catalog exercise
  is the source of truth for how the session logger renders set fields** — `measure`
  joins `equipment` and `unilateral` under that same rule; exercise delete stays blocked
  once history exists.

### `agent-os/specs/2026-08-17-1238-workout-exercise-notes/`

- **Relationship:** Extends. Same seam, no overlap in decisions.
- **Relevant decisions:** Draft mapping belongs in `sessionDraft`, not in the React
  block; per-set notes explicitly declined — this spec likewise declines per-set measure.

### `agent-os/specs/2026-08-17-1402-shelve-task-exercise-link/`

- **Relationship:** Context only.
- **Relevant decisions:** Tasks and the workout log stay separate, so nothing here needs
  to reach the outline.

## Similar implementations

### Equipment as a catalog config axis

- **Location:** `src/lib/fitness/equipment.ts`, `src/lib/fitness/types.ts`
- **Relevance:** The exact shape `measure.ts` should copy — enum, options list,
  `isX` / `normaliseX`, capability predicates (`usesWeight`, `allowsUnilateral`), and
  formatting helpers kept out of the components.
- **Key patterns:** Predicates named for the question the UI asks; `normaliseX` falls back
  to the default rather than throwing.

### Rest timer

- **Location:** `src/components/fitness/RestTimer.tsx`, `src/lib/fitness/restTimer.ts`
- **Relevance:** The timer pattern to follow for the hold stopwatch.
- **Key patterns:** Clock math is pure and in lib; the component stores a wall-clock
  instant and ticks a `setInterval`, computing from `Date.now()` so backgrounding cannot
  drift it; side effects (audio, tab title) are best-effort and never break the log.
  `formatRestClock` becomes a delegate to the new shared `formatDurationClock`.

### Plate hint under the weight field

- **Location:** `PlateHint` in `src/components/fitness/SessionEditor.tsx`,
  `src/lib/fitness/plates.ts`
- **Relevance:** The slot and idea reused for the m:ss duration hint — a derived,
  non-editable line under its field.

### Set row rendering

- **Location:** `SetHeader` / `SetRow` in `src/components/fitness/SessionEditor.tsx`
- **Relevance:** The four hardcoded grid variants that `setColumns()` replaces. Their
  existing `grid-cols-[…]` templates are the widths to preserve.

### Session label formatting

- **Location:** `formatSetsLabel` in `src/lib/fitness/format.ts`, called from
  `queries.ts:147` and the Last-time hint
- **Relevance:** The `3×token` collapse survives unchanged once the per-set token learns
  about duration.
