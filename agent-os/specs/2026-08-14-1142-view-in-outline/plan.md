# View in Outline

**Status: frozen / complete** (2026-08-14)  
Spec folder: `agent-os/specs/2026-08-14-1142-view-in-outline/`

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-06-1010-command-surface/` — one registry, named menus, row menu, Commands panel, palette
- **Extends:** `agent-os/specs/2026-08-13-1050-menu-completeness/` — every non-`go` command has a `menu`; same label/icon/action on every surface
- **Extends:** `agent-os/specs/2026-08-05-2121-command-deck-and-item-actions/` — capability-aware command deck
- **Extends:** `agent-os/specs/2026-07-31-1520-persistent-ui-state/` — addressable view state lives in the URL (`?detail=`, `?scope=`, `?zoom=`); filters stay in `user_settings`
- **Extends:** `agent-os/specs/2026-08-13-0747-module-pages/` — Plan pages (Outline, Projects, Tasks, Goals, Wish List) are sibling destinations of one module

Does **not** add Achieve's reverse **Actions → View Details**. That is a follow-up.

## Context

Achieve's **Outline → View in Outline** jumps from a detail tab (Projects, Tasks, …) to the Outline tab with the active item displayed and selected (`docs/achieve-planner/user-manual.md` §3.3.13; `online-help.md` Outline Menu).

We already have the sibling verbs **View tasks…** and **View project…** as plain navigations (`?scope=`, `?detail=`). There is no command that takes a selected project, task, goal, or result area to the Outline and keeps that row selected. Clicking **Outline** in the page bar drops you on the Outline's own selection (first row, or whatever `?detail=` last opened).

This is that missing command.

## Decisions

1. **Select the row only.** Do not open the detail drawer. `?detail=` stays "drawer is open." A new `?select=<nodeId>` is the landing instruction.
2. **Hosts:** Projects, Tasks, Goals, Result Areas, Task Chooser (all via `useNodeCommandDeck`). Wish List goes to the **owning node** (`wish.nodeId`), via a `pageCommands` override — its row id is a `node_item`, not a node. Omit on Outline itself. Out of scope: Day, Schedule, Notes, and **View Details**.
3. **Reveal so it is actually displayed:**
   - Expand every collapsed ancestor of the target (existing `setCollapsedAction`, driven by a new pure helper on `walkUp`).
   - If Outline is zoomed to a branch that does not contain the target, clear zoom (`replace`, not `push`).
   - Do **not** rewrite the Outline's saved view or column filters. A completed row hidden by the default Outline filter stays selected but off-screen until the filter is cleared. Call this out as a known limitation.
4. **Command placement** — fourth cross-module verb, same family as View tasks / View project:
   - id `record.view-in-outline`
   - label `View in Outline`
   - `menu: "item"`, `section: "Item"`, `icon: "go-to"`, `rowMenu: true`
   - no toolbar icon, no invented shortcut (Achieve did not document one in the reference pack)
   - disabled with "Select a row first" when nothing is selected
   - acts on the focus row only (not the multi-select), like Open
5. **Navigation is a URL.** `router.push(outlineSelectPath(id))` → `/plan/outline?select=<id>`. Reload and Back work. Outline consumes `?select=`, selects, reveals, and does not set `?detail=`.
6. **Unknown id** (deleted, other user, junk): ignore. Keep whatever selection Outline already had.
7. **Intentional Achieve match.** Same command name and outcome. Menu name is **Item**, not Outline — we do not restore Achieve's Outline menu (frozen in menu-completeness).

## Acceptance criteria

- [x] From Projects, Tasks, Goals, Result Areas, and Task Chooser, **View in Outline** appears in Item, the row menu, the Commands panel, `⌘K`, and phone `⋯`, with the same label and `go-to` icon.
- [x] Invoking it navigates to `/plan/outline?select=<id>`. The target row is selected. The detail drawer is closed.
- [x] Collapsed ancestors of the target are expanded so the row is on screen; DataGrid already scrolls the focus row into view.
- [x] If Outline was zoomed to a different branch, zoom is cleared. Zoom is kept when the target is the zoom root or a descendant. (A clean `outlineSelectPath` already drops leftover `?zoom=`; the host still clears an excluding zoom if both params are present.)
- [x] Wish List's command selects the **owning** outline node, not the wish item id.
- [x] Outline itself does not offer the command. No selection → visible and disabled with "Select a row first."
- [x] Outline's saved view / filters are left alone.
- [x] Unit tests cover the command (present / absent / disabled), `?select=` round-trip, collapsed-ancestor ids, and zoom-membership. No React component tests. No new `"use server"` surface — existing `setCollapsedAction`.
- [x] Browser verification at 1280×800 and 390×844: Projects / Tasks / Chooser / Wish List / collapsed parent / phone `⋯`. No `src/app/**` change, so smoke was not required.

## Changes from original plan

Material refinements during implementation (requirements, design, scope). Omit pure
code polish.

| #   | Change                                                                                                            | Why                                                                                                                                                                                                                          |
| --- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Re-select the target once it appears in `orderedIds`, instead of treating the render-phase `selectOne` as enough. | `pruneSelection` drops an id that is still hidden. Expanding ancestors in an effect is one tick too late: the first paint prunes the selection to the first visible row (e.g. Career) and the expanded row lands unselected. |

## Task 1: Save Spec Documentation

Create `agent-os/specs/2026-08-14-1142-view-in-outline/` with plan, shape, standards, and references.

## Task 2: Addressable `?select=`

Add `SELECT_PARAM` to `viewState.ts`, expose it on `useViewStateUrl`, add `outlineSelectPath`. Unit-test.

## Task 3: Command in the deck

`onViewInOutline` in `commandDeck` / `useNodeCommandDeck`. Wish List `pageCommands` override with `wish.nodeId`.

## Task 4: Outline consumes `?select=`

Select, expand collapsed ancestors, clear zoom if the target is outside the zoomed branch. Do not open the drawer.

## Task 5: Verify, freeze spec, update roadmap

Browser + unit tests. Freeze. One-line on the roadmap if it fits.

---

While this spec is **active**, when we make a material change to requirements, design,
or scope (including from feedback on what was implemented), update the relevant sections
and append to **Changes from original plan**. Skip pure implementation details. Freeze
when verified.
