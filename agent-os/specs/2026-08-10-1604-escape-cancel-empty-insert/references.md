# References for Escape cancels empty new grid row

## Achieve Planner

### Inserting new rows (cancel with Esc)

- **Location:** `docs/achieve-planner/user-manual.md` §3.3.1
- **Relevance:** Blank insert → Esc removes the row; after any cell change, Esc no longer cancels
- **Key quote:** “If you’ve accidentally added a blank row to the grid, you can cancel the insert by pressing the Esc key”

## Similar implementations

### List-tab create → name

- **Location:** `src/components/tabs/useGridTab.ts` (`startNaming`, `onFinishEdit`, `onCancelEdit`)
- **Relevance:** Shared editing state for Tasks / Projects / Goals / Result Areas
- **Key patterns:** Create success → `startNaming(id)`; rename uses `setEditingId` only

### Outline create → name

- **Location:** `src/components/outline/OutlineGrid.tsx` (`startNaming`, `addSibling`, `addChild`, …)
- **Relevance:** Parallel create/edit state (not via `useGridTab`)
- **Key patterns:** Same finish/cancel shape; `confirmDelete` neighbor selection to mirror on discard

### Name cell editor

- **Location:** `src/components/grid/cells.tsx` (`NameCell`, `NameEditor`)
- **Relevance:** Escape currently cancels edit only; blur commits
- **Key patterns:** Must pass draft on cancel; guard blur after Escape

### Persist-first create

- **Location:** `src/lib/tree/mutations.ts` (`createNode` / `createNodeOnce`, `name = ""`)
- **Relevance:** Rows exist in DB before the user types; cancel = delete, not “never create”

### Command create plumbing

- **Location:** `src/components/grid/useNodeCommandDeck.tsx`, `src/lib/grid/commandDeck.ts`
- **Relevance:** Toolbar / Insert keys / row menu all call `createNodeAction` + `onCreated`

### Day draft (contrast — not the model)

- **Location:** `src/components/day/DailyItemsGrid.tsx` (draft line / `commitDraft`)
- **Relevance:** Does not persist until non-empty; Escape clears local draft
- **Note:** Different domain; do not retrofit outline create onto this without a redesign

## Related specs

- Outline scaffold: `agent-os/specs/2026-07-27-1100-scaffold-and-outline-tab/`
- Main grid tabs: `agent-os/specs/2026-07-28-1121-main-grid-tabs/`
- Command deck / item actions: `agent-os/specs/2026-08-05-2121-command-deck-and-item-actions/`
