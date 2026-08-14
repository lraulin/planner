# References for View in Outline

**Status: frozen / complete** (2026-08-14)

## Governing specs

### `agent-os/specs/2026-08-06-1010-command-surface/`

- **Relationship:** Extends
- **Relevant decisions:** One registry drives menu bar, icon toolbar, Commands panel, row
  menu, and palette. `pageCommands` is the override channel (Wish List Open owner).

### `agent-os/specs/2026-08-13-1050-menu-completeness/`

- **Relationship:** Extends
- **Relevant decisions:** Every non-`go` command has a `menu`. Same label/icon/action
  everywhere. We do not restore Achieve's Outline menu name.

### `agent-os/specs/2026-08-05-2121-command-deck-and-item-actions/`

- **Relationship:** Extends
- **Relevant decisions:** Capability-aware deck. Cross-module verbs are optional actions
  (`onViewTasks`, `onViewProject`); a host that omits the action does not show the command.

### `agent-os/specs/2026-07-31-1520-persistent-ui-state/`

- **Relationship:** Extends
- **Relevant decisions:** URL holds drawers and sub-view. `?detail=` means the drawer is
  open. Filters stay in `user_settings`. A landing that must not open the drawer cannot
  reuse `?detail=`.

### `agent-os/specs/2026-08-13-0747-module-pages/`

- **Relationship:** Extends
- **Relevant decisions:** Outline, Projects, Tasks, Goals, Wish List are pages of Plan.
  `/plan/outline` is the destination.

## Achieve

- `docs/achieve-planner/user-manual.md` §3.3.13 — Outline→View in Outline: "The active
  item in the detail tab is displayed and selected in the Outline tab."
- `docs/achieve-planner/online-help.md` Outline Menu — "View the current item in the
  Outline tab (if applicable)."
- Reverse command (out of scope): Actions→View Details, same user-manual section.

## Similar implementations

### View tasks / View project

- **Location:** `src/lib/grid/commandDeck.ts`, `src/components/grid/useNodeCommandDeck.tsx`
- **Relevance:** The three (now four) cross-module verbs. Plain `router.push` of
  addressable URL state. One implementation in the hook, five hosts inherit.
- **Key patterns:** Action present → command exists. Disabled with a specific reason.
  `rowMenu: true`, `menu: "item"`, `icon: "go-to"`.

### `?detail=` / `?scope=`

- **Location:** `src/lib/url/viewState.ts`, `src/components/url/useViewStateUrl.ts`
- **Relevance:** Same rail for `?select=`. `outlineSelectPath` next to `notesPath`.
- **Key patterns:** `asRecordId`, junk is absent, `hrefWithViewState`.

### Outline selection sync

- **Location:** `src/components/outline/OutlineGrid.tsx`
- **Relevance:** Already selects from `?detail=` during render so the open drawer has an
  owner. `?select=` must select without calling `setDetail`. Expand/zoom mutations belong
  in an effect, not that render-phase sync.

### Ancestor walk and zoom

- **Location:** `src/lib/tree/walkUp.ts`, `src/lib/tree/zoom.ts`
- **Relevance:** Reveal is "expand collapsed ancestors" + "is this id inside the zoomed
  branch?" Both are walks we already have.
