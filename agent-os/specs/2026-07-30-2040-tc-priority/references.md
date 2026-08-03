# References for TC Priority

## Parent spec

**`agent-os/specs/2026-07-30-1858-task-chooser`** (frozen). This slice extends it; that
folder stays sealed. Read it first for the chooser's candidate rule, scoring formula, views,
date filters, and settings persistence — all of which this builds on.

## Patterns borrowed

### Row drag-and-drop

- **Location:** `src/components/grid/DataGrid.tsx` (`RowDrag`), `src/lib/tree/dnd.ts`,
  `src/components/outline/OutlineGrid.tsx`
- **Relevance:** `RowDrag` was already generic — `resolve()` returns a drop hint or `null`,
  `onDrop()` performs the move — so the chooser supplies TC-ranking semantics without the
  grid learning anything new. Group-header drops work because the outline already needed
  them for category grouping (`resolveCategoryGroupDrop`).
- **Key patterns:** rows arm `draggable` on mousedown so text selection inside cells still
  works; plans are computed against the whole tree, not the visible rows.

### Inline priority editing

- **Location:** `src/components/grid/cells.tsx` → `PriorityCell`, `src/lib/tree/format.ts`
- **Relevance:** `TcPriorityCell` is its sibling and reuses `parsePriority` / `formatPriority`.
- **Key difference:** `PriorityCell` stores what you type verbatim, including a bare "A".
  TC Priority always resolves a letter to a position, so what you type is a _request_ the
  ranking rules answer — and the cell then shows the rank you actually got.

### Batched, user-scoped mutations

- **Location:** `src/lib/tree/mutations.ts` (`moveNode` and its transaction), and the
  standing rule in its header comment that every mutation scopes on `userId`
- **Relevance:** `setTcPriorities` follows both — one transaction for the whole renumber,
  every statement scoped, so a plan naming a foreign node writes nothing.

## Source material

| What                                           | Where                                                                                                                                                                                                                 |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Achieve Task Chooser screenshot (Best Overall) | `../2026-07-30-1858-task-chooser/visuals/task-chooser.png`                                                                                                                                                            |
| Manual — Task Chooser                          | `docs/achieve-planner/user-manual.md` §8. **Note:** the PDF conversion lost the TC Priority column entirely — no `TC` appears anywhere in the text. This slice was built from the user's description of the original. |
| As-built screenshots                           | `visuals/tc-todo.png`, `visuals/tc-dragged.png`, `visuals/tc-settings.png`                                                                                                                                            |

## Standards

Same set as the parent spec — see `../2026-07-30-1858-task-chooser/standards.md` for the
full text of `components/ux-principles`, `components/modal-pattern`, and
`development/testing`. The one that bit hardest here: _anything touching the database gets
an integration test, and it is not done until a second user has tried to read, change, and
delete the first user's row and failed at every step_.
