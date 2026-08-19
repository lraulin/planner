# References for Always-ranked outline priorities

## Governing specs

### `agent-os/specs/2026-07-27-1100-scaffold-and-outline-tab/`

- **Relationship:** Supersedes — the optional-rank decision only.
- **What changes:** plan.md:23 "ABCD priorities with **optional numeric rank**"; plan.md:100
  `priority_rank` nullable. A node's rank is no longer optional.
- **What carries forward:** `## Change: drag-to-reorder (2026-07-28)` in full — drop
  resolution as a pure function in `src/lib/tree/dnd.ts`, thirds of the row as
  before/child/after, illegal levels snapping to the nearest legal ancestor, drag behind an
  opt-in `rowDrag` prop.

### `agent-os/specs/2026-08-05-2121-command-deck-and-item-actions/` and `agent-os/specs/2026-08-06-1010-command-surface/`

- **Relationship:** Supersedes — the `priorityMaintenance` capability and its two commands.
- **What carries forward:** "Treat a filtered list as a view onto the full tree. Priority
  repair always receives the complete sibling set." That principle now applies to _every_
  priority write, not just to repair. Menu placement (Organize ▸ Priority) is reused by the
  new selection command.

### `agent-os/specs/2026-07-30-2040-tc-priority/` — frozen 2026-07-30

- **Relationship:** Extends.
- **Relevant decisions, now generalized to the outline:** "**Ranks are dense and automatic.**
  No bare letters here: assigning a letter always places the item, so there is always a
  number." · "**Every letter gets ranks, D included.** One rule beats a special case." ·
  "**Compact on the next drag, not on completion.** Completing your A2 leaves A3 as A3."
- **Still out of scope there and here:** per-view rankings, ranking TC from the Outline/Tasks
  tab.

### `agent-os/specs/2026-07-31-1245-day-tab/` — active

- **Relationship:** Extends.
- **Relevant decisions:** the shared-engine extraction — `letterRankEngine(read)` in
  `src/lib/priority/letterRank.ts`, with `src/lib/chooser/tcPriority.ts` and
  `src/lib/day/priority.ts` as thin adapters, and `LetterRankCell` as the UI extraction. This
  work adds the outline's binding and widens `planAssign` to a block.
- **Regression gate inherited:** `tcPriority.test.ts` must keep passing unchanged.

### `agent-os/specs/2026-08-04-0924-grid-control-surface/` — frozen 2026-08-04

- **Relationship:** Extends. Durable rules already extracted to
  `agent-os/standards/components/data-grid.md`.
- **Relevant decisions:** "Drag-to-reorder is a first-class capability, not a fallback; it is
  disabled under an active non-priority sort and says so via the sort chip." ·
  "`useTreeRowDrag`'s `headerSort` / `clearHeaderSort` are array-aware."

### `agent-os/specs/2026-07-31-1938-responsive-mobile/`

- **Relationship:** Constrains Task 2. "Drag-to-reorder — **Off below `md`** — replaced by
  explicit 'Move to…' commands in the long-press menu." If that is the reported symptom, the
  replacement is separate work.

### `agent-os/specs/2026-07-28-1121-main-grid-tabs/`

- **Relationship:** Touched. Its priority filter presets (`Only A1`, `Only Ranked As`,
  `Ranked`, `Unranked`, …) presuppose optional ranks; `Ranked`/`Unranked` get renamed.

### `agent-os/specs/2026-08-02-1208-custom-column-filters/`

- **Relationship:** Mismatch recorded. It names `encodePriority` as the priority comparison,
  which contradicts `src/lib/priority/order.ts`. The contradiction only bites on bare letters,
  so it dissolves here.

## Achieve Planner reference

- `docs/achieve-planner/online-help.md:412-418` — "Each priority value consists of a range and
  an **optional rank** … You can also leave the rank off with only the letter … Unranked
  priority values are placed after ranked priority values: A2499 is a higher priority than A."
- `docs/achieve-planner/online-help.md:424` — drag-to-reprioritize: "The dragged row will
  assume the appropriate priority based on the target row and the priority of all other rows
  will be shifted accordingly."
- `docs/achieve-planner/online-help.md:427-429` — the two repair commands, with the worked
  example `A4, A7, A, B4, B7` → `A1, A2, A, B1, B2` (note the bare `A` staying put).
- `docs/achieve-planner/workflow-and-training.md:470` — "Priorities are made up of a letter
  … with an **optional numeric rank**."
- `docs/achieve-planner/user-manual.md:1441-1447` — Move Up / Move Down also reprioritize in a
  prioritized list. `:2046` — "sub-item priority ranks are relative to the parent."
- `docs/achieve-planner/file-formats.md:106-113` — the int encoding (letter bases
  0/2500/5000/7500; `2500` = bare B), which is why import can reintroduce bare letters.

## Implementation references

| Location                                                  | Relevance                                                                                                                                                                                                        |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/priority/letterRank.ts`                          | The shared placement engine. `planAssign` / `planDrop` / `planDropOnLetter` / `planClear` / `compare`, and `assertRankedLetterPriorities` as the write-boundary guard. **The pattern to extend, not duplicate.** |
| `src/lib/priority/order.ts`                               | The one ordering rule; its `BARE` slot becomes unreachable for nodes.                                                                                                                                            |
| `src/lib/priority/maintenance.ts`                         | Being deleted. Its full-sibling-set loading is the part worth keeping.                                                                                                                                           |
| `src/lib/tree/outlinePriority.ts`                         | The outline's adapter — `planSiblingPriorityDrop`, `priorityDropFromPosition`, `siblingPool`.                                                                                                                    |
| `src/lib/chooser/tcPriority.ts`                           | The reference adapter: how a caller binds the engine to its own field names. Copy its shape.                                                                                                                     |
| `src/lib/day/priority.ts`                                 | The second adapter, and the precedent for an always-ranked list.                                                                                                                                                 |
| `src/lib/tree/mutations.ts`                               | `setPriority:296`, `applyPriorityAssignments:313`, `removePriorityGaps:331`, `reprioritizeUnique:351`, `moveNode`.                                                                                               |
| `src/lib/detail/mutations.ts`                             | `saveNodeDetail` — the second verbatim write path (`:148,273,500`).                                                                                                                                              |
| `src/lib/tree/format.ts:131-147`                          | `parsePriority` / `formatPriority`, and the `aa` shortcut to generalize.                                                                                                                                         |
| `src/components/grid/LetterRankCell.tsx`                  | The cell that treats input as a request and re-syncs to the granted rank. What the outline column becomes.                                                                                                       |
| `src/components/grid/cells.tsx:31,50-55,287`              | `PRIORITY_COLOR`, `nameToneClass`, `PriorityCell`. `NameIconContext` in the same file is the pattern for the new colour-source context.                                                                          |
| `src/components/grid/DataGrid.tsx:763-834,1313`           | `dragBindingFor` (with the `compact` gate), `dropZoneFor`.                                                                                                                                                       |
| `src/lib/tree/dnd.ts:76-132`                              | `resolveDrop` — the before/inside/after ambiguity resolver.                                                                                                                                                      |
| `src/lib/grid/commandDeck.ts:802-838`                     | The two commands to delete; the shape for the new one.                                                                                                                                                           |
| `src/lib/chooser/views.ts:361-396`                        | `applyNextActionFilter` — the two modes behind the video-series symptom.                                                                                                                                         |
| `src/lib/chooser/settings.ts`, `src/lib/chooser/types.ts` | Where the new per-view setting goes.                                                                                                                                                                             |
| `src/components/chooser/ChooserGrid.tsx:280-291`          | The `view.tcPriority` drag gate the setting replaces.                                                                                                                                                            |
| `src/lib/settings/scopes.ts`                              | `chooserScope()`, `SETTINGS_VERSION`.                                                                                                                                                                            |
| `drizzle/0028_drop-invalid-priorities.sql`                | Precedent for a data-repair migration across the priority columns.                                                                                                                                               |
