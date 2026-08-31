# Page bar: an explicit Rearrange mode

**Status: frozen / complete** (2026-08-31)
Spec folder: `agent-os/specs/2026-08-31-0758-page-bar-arrange-mode/`

## Spec relationships

- **Supersedes (in part):** `agent-os/specs/2026-08-29-1934-page-bar-reorder/` — four of its
  decisions only. Everything else in that spec stands.
  - always-live drag on every desktop tab → drag is armed only inside Rearrange mode;
  - `cursor-grab` on a page-bar tab → the default tab shows the link cursor;
  - `title: "Drag to reorder"` on a tab → no title outside the mode;
  - “no Move left/right in this slice” → `←`/`→` exist, which also **retires that spec's
    recorded follow-up** and closes its `responsive.md` deviation.
- **Does not supersede:** the persistence model (`pageOrder` on `ShellSettings`), the merge
  rules in `applyPageOrder`, `modulePages` as the one accessor, the `placePage` drop
  arithmetic, the insertion-line drop marker, registry default order, or “not an open set”.
- **Extends:** `agent-os/specs/2026-08-05-0838-navigation-and-command-surface/` — the mode is
  entered through the command registry, so one registration reaches the View menu, the
  Commands panel, `⌘K`, and the phone's `⋯`.
- **Interaction sibling:** `agent-os/specs/2026-08-04-1900-column-menus-and-header-drag/` —
  `ColumnHeader` already resolves “sortable _and_ draggable” in favour of the primary action's
  cursor. The page bar now agrees with it.

## Context

`PageBar` put `cursor-grab active:cursor-grabbing` on every tab whenever `!compact && pages
.length >= 2` — which on a desktop is always. Two problems followed from arming drag
permanently on a control whose primary action is navigation:

1. **The cursor lied.** Every tab in every module advertised itself as a drag handle. The repo
   had already settled this the other way: a sortable, draggable column header shows
   `cursor-pointer` and discovers drag through its `title`.
2. **A click that slid a few pixels could silently permute the bar.** The `suppressClick` ref
   existed for no other reason than to stop a completed drag from also navigating — machinery
   needed only because the two gestures overlapped on one always-armed element.

Separating them removes the collision rather than managing it. It also lets the tabs stop being
links while arranging, which is what makes a phone reorder path possible at all: buttons can be
moved with `←`/`→` without any HTML5 drag.

## Decisions

- **Entry is a registered command, not permanent chrome.** `PageBar` registers
  `view.arrange-pages` and `view.reset-page-order` under `menu: "view"`, `section: "Page bar"`.
  One registration is the View menu, the Commands panel, `⌘K`, and the phone's `⋯`
  (`OverflowMenu` renders `overflowMenus(useCommands())`), so the phone entry point costs
  nothing extra.
- **The mode replaces the bar's contents; it does not decorate them.** Tabs render as
  `<button>`, not `NavLink`. A click selects instead of navigating, so a drag that does not take
  cannot yank the page out from under you.
- **The mode is transient state, never a setting.** It lives in component state and is held
  _per module_ (`arrangingModule === active`), so switching modules exits it with no
  setState-in-effect. Reloading into a bar whose tabs do not navigate would be a trap; only the
  _order_ persists, exactly as before.
- **Compact gets the mode too**, driven by select + `←`/`→` rather than drag. HTML5 drag stays
  desktop-only (`responsive.md`), but the ranking is now reachable without a desktop.
- **One visual signal, spent once.** A tinted container plus a dashed inset outline and a `⋮⋮`
  grip per tab — the same glyph `ShowFieldsDialog` uses — so the mode is unmistakable without
  every tab carrying a permanent affordance.

### Out of scope

- Form-section tabs, sidebar module order, closable tabs, touch-drag polyfill.
- Any change to registry default order or to the merge/persistence rules.
- A `role="tablist"` rewrite of the bar. It stays navigation (`aria-current="page"`).

## Acceptance criteria

- [x] Hovering a tab outside the mode shows the link cursor, has no drag title, and is not
      draggable; dragging it does nothing.
- [x] Click navigates; modifier-click still opens a new tab (it is still a real `NavLink`).
- [x] View ▸ Rearrange pages (and `⋯` ▸ the same, below `md`) swaps the bar for the arrange
      toolbar, visibly distinct.
- [x] Dragging a tab in the mode reorders it, with the existing insertion line.
- [x] Selecting a tab and pressing `←`/`→` moves it one slot; the moved tab keeps focus; the
      arrows are disabled at the ends and with nothing selected.
- [x] `Esc` and `Done` leave the mode; the order survives a reload.
- [x] `Reset` clears that module's `pageOrder` and is disabled once there is nothing to clear.
- [x] Switching modules leaves the mode.
- [x] `movePage` unit-tested; no React component tests.

## Changes from original plan

| #   | Change                                                                                                        | Why                                                                                                                                              |
| --- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | The memoised **empty** command array was dropped; the one `useMemo` returns `[]` itself when there is no bar. | Two arrays for one registration, when the memo already covers the bar-less case. Same guarantee, one fewer hook.                                 |
| 2   | The `useMemo` depends on a derived `hasBar` boolean rather than `pages.length`.                               | React Compiler refuses to preserve a memo whose dependency is a property of a locally-built array (`react-hooks/preserve-manual-memoization`).   |
| 3   | Added focus restoration after a `←`/`→` move (`requestAnimationFrame` on a ref map).                          | Re-parenting the focused button drops focus in some browsers, so the second arrow press would go nowhere. Not in the plan; found in the browser. |
| 4   | `Reset page order` is `disabled` when the module has no stored order, in the menu and on the button.          | The plan did not say; a Reset that does nothing teaches nothing.                                                                                 |

## As built

- `src/lib/navigation/pageOrder.ts` — `movePage(ids, id, "left" | "right")`, expressed in
  `placePage` slots so the arrow path and the drag path cannot disagree about an index.
- `src/components/shell/PageBar.tsx` — two render branches over one `TAB_LABEL` constant and one
  `DropMark`. Default: `<nav>` of `NavLink`s, `draggable={false}`, no `suppressClick`, no
  `onDragStart` / `onDragEnd` / click preventer, no title. Arrange: `<div role="toolbar">` of
  `<button>`s with `⋮⋮` grips, `bg-select` on the selection, `cursor-grab` (desktop only), the
  existing `dropSlot` / `onTabDragOver` / `onTabDrop`, and trailing `←` `→` `Reset` `Done`.
- `useRegisterCommands` is called above the `pages.length < 2` early return, with a memoised list.

## Verification

`npm run test:unit` (3832), `npm run lint`, `npm run typecheck`, `npm run smoke` (62 routes).
Browser at desktop width on Plan: pointer cursor and no drag outside the mode; View ▸ Rearrange
pages; drag reorder; `←` walking a tab to the front and stopping there with focus kept; `Esc`;
reload; `Reset` restoring registry order and disabling itself.

**Not verified in-browser:** the 390px pass. The automation could not resize the browser window
below the desktop breakpoint. The compact branch is the same tree minus `draggable`, and the
`⋯` sheet renders every non-`ownControl` section, so the entry point follows from the
registration — but it is confirmed on the deployed phone, not here.

## Follow-ups

- None.
