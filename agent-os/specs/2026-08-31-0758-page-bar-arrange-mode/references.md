# References for the page-bar arrange mode

## Governing specs

### `agent-os/specs/2026-08-29-1934-page-bar-reorder/`

- **Relationship:** Supersedes **in part** — always-live drag, `cursor-grab` on tabs, the
  “Drag to reorder” title, and “no Move left/right in this slice” (whose recorded follow-up
  this retires). Everything else stands.
- **Relevant decisions kept:** `pageOrder` on `ShellSettings`; `applyPageOrder` merge rules;
  `modulePages` as the one accessor so Go-to cannot disagree with the bar; `placePage` slot
  arithmetic counting the dragged tab while it is still in the list; insertion line on the slot
  boundary; registry stays the source of the default order.

### `agent-os/specs/2026-08-13-0747-module-pages/`

- **Relationship:** Extends. Page tier, underline bar, `lastPage`, the ≥2-page floor that is
  also why `useRegisterCommands` has to sit above the early return.

### `agent-os/specs/2026-08-05-0838-navigation-and-command-surface/`

- **Relationship:** Extends. One registry, five renderers — the reason the phone entry point is
  free. Still **does not** reopen “not an open set”.

### `agent-os/specs/2026-08-16-2152-app-menu-above-pages/`

- **Relationship:** Extends the bar's rank only. The View menu the mode is entered from is that
  menu bar.

### `agent-os/specs/2026-08-04-1900-column-menus-and-header-drag/`

- **Relationship:** Interaction sibling. `ColumnHeader` is where the cursor rule was settled:
  a header that both sorts and drags shows `cursor-pointer`. Borrow the rule, not the module.

### `agent-os/specs/2026-07-31-1938-responsive-mobile/`

- **Relationship:** Constrains the mode's compact branch (no HTML5 drag) and is satisfied by
  the `←`/`→` controls.

## Similar implementations

### Reorder-by-select-and-move, with grips

- **Location:** `src/components/grid/ShowFieldsDialog.tsx`
- **Relevance:** The in-repo model for the arrange branch — the `⋮⋮` text glyph, `bg-select` on
  the selected row, and selection derived from the current list rather than corrected in an
  effect.

### Command registration from a shell component

- **Location:** `src/components/shell/ApplicationMenu.tsx`, `src/components/shell/CommandProvider.tsx`
- **Relevance:** The `useMemo`-per-command shape, and the churn guard that makes memoising the
  registered array mandatory rather than merely tidy.

### Overflow as the phone's menu bar

- **Location:** `src/components/shell/OverflowMenu.tsx`, `src/lib/commands/menus.ts`
- **Relevance:** `overflowMenus` renders every non-`ownControl` section, so a `section: "Page
bar"` registration reaches the phone with no extra work.

### Order helpers

- **Location:** `src/lib/navigation/pageOrder.ts` (+ `pageOrder.test.ts`)
- **Relevance:** `movePage` is built on `placePage` so the arrow path and the drag path share
  one definition of a slot.
