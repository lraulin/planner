# References for Clear priority on settle

## Governing specs

### `agent-os/specs/2026-08-19-0912-always-ranked-priorities/`

- **Relationship:** Extends the dense unique model; supersedes “completed siblings keep their ranks and stay in the pool.”
- **Relevant decisions:** Unprioritized is still first-class. Typing `A` still appends. Delete still closes a gap. The sibling pool is still one parent’s children. Settled work is now unprioritized instead of occupying a slot.

### `agent-os/specs/2026-07-30-2040-tc-priority/`

- **Relationship:** Extends the separate global TC field and `letterRankEngine`; supersedes “compact on the next drag, not on completion.”
- **Relevant decisions:** Outline Pri and TC Pri stay independent. Ranks stay dense and automatic. Completing now calls `planClear` rather than waiting for the next drag.

### `agent-os/specs/2026-07-31-0834-task-recurrence/` and `2026-08-01-1900-recurrence-ap-parity/`

- **Relationship:** Extends reset-in-place (same id, Focus, outline Pri on a cycle); supersedes “reset in place so TC Priority survives.”
- **Relevant decisions:** A cycling complete never lands on `completed` — the settle hook must key off the request plus whether this write cycled. Series-end is already a real `completed` write; it clears both fields.

### `agent-os/specs/2026-08-04-2200-completion-cascade-and-levels/`

- **Relationship:** Extends. Hook in `applyStateTransition` so cascade is free.
- **Relevant decisions:** Cascade keys off **resulting** state, so a cycling recurring task does not settle its subtree. Completed and cancelled are interchangeable settles. Drawer/day only get the upward half (no confirm), which does not change this work.

### `agent-os/specs/2026-07-31-1245-day-tab/`

- **Relationship:** Touched, not changed. Day ABC stays out of scope (per-day ranks; settled lines already sort to the bottom of that day). Completing a node-backed day line still goes through `applyStateTransition`, so the node’s outline/TC ranks follow this spec.

## Similar implementations

### Shared ranking engine

- **Location:** `src/lib/priority/letterRank.ts`
- **Relevance:** `planClear` is the operation this spec invokes on settle. Header currently says nothing renumbers because an item was completed — update the comment; do not change the engine’s mechanics.
- **Key patterns:** A touched letter is densified `1..n`. Callers bind their own pool and field names.

### Outline adapter

- **Location:** `src/lib/tree/outlinePriority.ts`, `src/lib/tree/mutations.ts` (`siblingPriorityPool`, `assignPriorityAmongSiblings`, `applyPriorityAssignments`)
- **Relevance:** Outline clear on settle reuses this pool and write helper. `gapCloseFor` on delete/move is the existing “close the hole” pattern.

### TC adapter

- **Location:** `src/lib/chooser/tcPriority.ts` (`planTcClear`), `src/lib/tree/mutations.ts` (`setTcPriorities`)
- **Relevance:** TC clear on settle. `setTcPriorities` opens its own transaction — extract an inner persist helper that takes `tx` so settle can run inside `applyStateTransition`’s transaction.

### State write

- **Location:** `src/lib/tree/mutations.ts` `applyStateTransition` / `setState`
- **Relevance:** The only hook. Grid, drawer (`src/lib/detail/mutations.ts`), day (`src/lib/day/mutations.ts`), and organizer (`src/lib/organizer/mutations.ts`) all funnel here. Recurrence cycle vs series-end is already decided here.

### Completion cascade (pure)

- **Location:** `src/lib/tree/completionCascade.ts`
- **Relevance:** Do not special-case priority here. Each cascaded node goes through `applyStateTransition`.

### Data-repair backfill

- **Location:** `drizzle/0054_typical_steel_serpent.sql` (and `drizzle/0028_drop-invalid-priorities.sql`)
- **Relevance:** Window-function densify per `(user, parent, letter)`. Copy that shape for remaining outline ranks and for remaining TC ranks (`PARTITION BY user_id, tc_priority_letter`).

## Achieve Planner

- `docs/achieve-planner/online-help.md` — optional rank, gaps left alone. We already diverged; this spec diverges further by dropping settled work from the ranking.
- `docs/achieve-planner/workflow-and-training.md` — outline Pri vs TC Pri are independent; TC is the daily to-do ranking. That distinction is why a recurring cycle keeps outline Pri and drops TC Pri.
