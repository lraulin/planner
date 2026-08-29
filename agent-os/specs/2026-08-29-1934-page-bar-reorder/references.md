# References for page-bar drag reorder

## Governing specs

### `agent-os/specs/2026-08-13-0747-module-pages/`

- **Relationship:** Extends.
- **Relevant decisions:** Page tier; underline bar; `pages.ts` as the pure registry;
  `modulePages` as the one accessor; `lastPage` in `shell`; bar only at ≥2 built pages;
  focused flows are not pages.

### `agent-os/specs/2026-08-05-0838-navigation-and-command-surface/`

- **Relationship:** Extends the registry and `shell` scope. **Does not supersede** “Not an
  open-set” (closable / reorderable / persisted open tabs).
- **Relevant decisions:** Sidebar + palette cover the working-set need; `TabStrip` is
  gone; shell settings load with the first HTML.

### `agent-os/specs/2026-08-13-0845-module-consolidation/`

- **Relationship:** Coordinates; does not supersede.
- **Relevant decisions:** Plan’s seven pages and Library’s pages are what the bar lists;
  registry order is Achieve’s / the old sidebar’s.

### `agent-os/specs/2026-08-16-1338-finances-dashboard-available/`

### `agent-os/specs/2026-08-18-0856-finance-accounts-page/`

- **Relationship:** Coordinates; do not supersede.
- **Relevant decisions:** Finances page-bar _default_ order is by how often a page is
  opened, Accounts last. That remains the registry order; user `pageOrder` overlays it.
  `pages.test.ts` ordered-id assertions stay.

### `agent-os/specs/2026-08-16-2152-app-menu-above-pages/`

- **Relationship:** Extends the bar’s rank only (menu above pages). Unchanged here.

### `agent-os/specs/2026-08-04-1900-column-menus-and-header-drag/`

- **Relationship:** Interaction sibling, not a parent.
- **Relevant decisions:** Drag the label; insertion line on the boundary; drop-index
  arithmetic that counts the dragged item while it is still in the list; click without a
  drag still activates.

### `agent-os/specs/2026-07-31-1938-responsive-mobile/`

- **Relationship:** Constrains Task 4. Drag off below `md`.

## Similar implementations

### Page bar and accessor

- **Location:** `src/components/shell/PageBar.tsx`, `src/lib/navigation/pages.ts`,
  `src/components/shell/modules.ts` (`modulePages`), `src/lib/navigation/pages.test.ts`
- **Relevance:** The surface to make draggable; the list to permute; the tests that must
  keep asserting _registry_ order.
- **Key patterns:** Real `NavLink`s (`aria-current="page"`); client bar already reads
  `useShellSettings` for `lastPage`.

### Shell settings

- **Location:** `src/lib/settings/shell.ts`, `shell.test.ts`,
  `src/components/shell/useShellSettings.ts`
- **Relevance:** `pageOrder` lives next to `lastPage`. Parser never throws; unknown keys
  drop at use time.
- **Key patterns:** `asMap` / `asStringArray`; codec is module-level so `useSetting` does
  not re-parse every render.

### Go-to generation

- **Location:** `src/components/shell/globalCommands.ts`
- **Relevance:** Already walks `modulePages`. Passing stored order here is how the palette
  and Commands panel stay in lockstep with the bar.

### Column-header drag

- **Location:** `src/components/grid/ColumnHeader.tsx`, `src/lib/grid/columnMenu.ts`,
  `src/lib/grid/fieldOrder.ts` (`placeField`, `withNewColumns`)
- **Relevance:** HTML5 drag + insertion line + slot arithmetic; new-item merge into a
  saved permutation.
- **Key patterns:** Borrow the _algorithm_, not the module. Navigation must not import
  `lib/grid`.

### Achieve

- **Location:** `docs/achieve-planner/online-help.md` (view tab order by dragging; tab
  groups are out of scope).
