# Page-bar drag reorder

**Status: frozen / complete** (2026-08-29)  
Spec folder: `agent-os/specs/2026-08-29-1934-page-bar-reorder/`

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-13-0747-module-pages/` — the Page tier, the underline
  bar, `pages.ts`, `modulePages`, `lastPage`, ≥2-page floor.
- **Extends:** `agent-os/specs/2026-08-05-0838-navigation-and-command-surface/` — one
  registry, `shell` settings scope, “anything else the shell remembers goes in the same
  scope.”
- **Does not supersede:** that spec’s **Not an open-set** decision (closable / reorderable /
  persisted _open_ tabs). `TabStrip` stays gone.
- **Does not supersede:** registry _default_ order (Plan = Achieve; Finances = frequency;
  Schedule = narrowest-first with Time Charts last). User order overlays it;
  `pages.test.ts` ordered-id assertions stay as default-order tests.
- **Interaction sibling:** `agent-os/specs/2026-08-04-1900-column-menus-and-header-drag/` —
  header-label HTML5 drag, insertion-line drop marker. Do not import grid code into the
  shell.

## Context

Achieve’s online help: _“The order of the view tabs can be changed by dragging tabs to
their desired location.”_ Mission: match Achieve when ambiguous. Planner’s current analogue
is the page bar (`PageBar.tsx`), not a working-set strip.

Order today is hardcoded in `src/lib/navigation/pages.ts`. Finances is long enough that a
personal permutation is useful; Plan has seven tabs. `lastPage` already remembers _which_
page you were on; this remembers _where the labels sit_.

Product: not a named roadmap item. On freeze, add a short completed note next to Module
pages.

## Decisions

- **Surface:** page bar only. Not form-section tabs, not sidebar modules, not closable tabs.
- **Persist:** `pageOrder: Record<string, string[]>` on `ShellSettings` (module id → page
  ids). Same `shell` blob as `lastPage` / sidebar, so the first HTML can paint the stored
  order (no registry-order flash). Absent key = registry order. Settings → Reset App shell
  clears it with the rest of `shell`.
- **One order everywhere:** apply the permutation in the `modulePages` accessor (optional
  stored ids). Page bar, Go-to palette (`useGlobalCommands`), and Commands panel then
  agree. Bare-path redirect still uses `lastPage`, not order.
- **Merge:** stored ids that are still built keep their relative order; unknown / unbuilt
  ids drop at use time (same posture as `lastPage`). Built pages missing from the stored
  list insert in their registry neighbourhood — after the rightmost _currently present_
  page that precedes them in the registry (same idea as `withNewColumns` in
  `fieldOrder.ts`, not a shared import). Empty/absent stored list = registry order, never
  an empty bar.
- **Drag:** HTML5, desktop only (`md` and up). Insertion line on the slot boundary, same
  idea as column headers. `placeField`-shaped move: drop index counts the dragged tab
  while it is still in the list. Click still navigates (`NavLink` stays a real link).
  `title` includes “Drag to reorder”.
- **Touch:** no HTML5 drag below `md` (`responsive.md`). Phone shows the desktop-saved
  order. **No Move left/right commands in this slice** — recorded deviation: this is
  chrome preference, not data ranking, and the phone still _displays_ the saved order.
  Follow-up if daily use on phone needs a reorder path.
- **Registry stays source of default.** New pages still land in `pages.ts` in the intended
  default slot; users who never dragged see that; users who did get the merge above.

### Out of scope

- Form-section tabs (`FormTabs`).
- Closable / open-set working-set tabs.
- Reordering sidebar modules.
- Touch-drag polyfill or Move left/right commands.
- Changing any module’s registry default order.
- Virtualization, tab groups (Achieve had tab groups; we do not).

## Acceptance criteria

- [x] Dragging a page-bar tab on desktop moves it to the drop slot; neighbors shift; an
      insertion line marks the slot.
- [x] A click without a drag still navigates. Modifier-click / open-in-new-tab still
      works (it is a real link).
- [x] The new order is the same after reload and after visiting another module and coming
      back.
- [x] Go-to palette entries for that module list in the same order as the bar.
- [x] Below `md`, tabs are not draggable; the stored order still displays.
- [x] A module with no saved `pageOrder` still shows registry order (Plan Achieve order,
      Finances frequency order, etc.).
- [x] A newly shipped page appears for users who already have a saved order, in its
      registry neighbourhood, not hidden and not always-last unless it is last in the
      registry.
- [x] A saved id for a page that is no longer built is ignored; the bar never shows a hole
      or a 404 tab.
- [x] Resetting App shell restores registry order.
- [x] `pages.test.ts` default-order assertions still pass. New unit tests cover merge,
      drop, empty, and place-at-index.
- [x] Smoke: Plan, Finances, Schedule, Notes, Fitness, Library bars — drag, reload,
      palette, phone width.

## Changes from original plan

Material refinements during implementation (requirements, design, scope). Omit pure
code polish.

| #   | Change | Why |
| --- | ------ | --- |
|     | None.  |     |

## As built

- `src/lib/navigation/pageOrder.ts` — `applyPageOrder`, `placePage`.
- `pageOrder` on `ShellSettings`; unknown ids drop at use time.
- `modulePages(id, pageOrder?)` is the one accessor; omit the second arg for registry order.
- `PageBar` HTML5-drags on desktop; compact sets `draggable={false}` (anchors default true).
- `useGlobalCommands` reads the same stored list so Go-to matches the bar.

## Task 1: Save spec documentation

This folder: `plan.md`, `shape.md`, `standards.md`, `references.md`. No visuals. **Done.**

## Task 2: Pure order helpers + shell setting

- `src/lib/navigation/pageOrder.ts` (+ `pageOrder.test.ts`):
  - `applyPageOrder(pages, storedIds | undefined)` — merge rules above.
  - `placePage(ids, id, toIndex)` — same slot arithmetic as `placeField` (do not import
    `lib/grid`).
- `pageOrder` on `ShellSettings`; parse like `lastPage` (string-array values, drop junk,
  never throw). Tests in `shell.test.ts`. **Done.**

## Task 3: One accessor consumes stored order

- `modulePages(id, pageOrder?: readonly string[])` applies `applyPageOrder`. Omit the
  second arg → registry order (redirects, tests).
- `PageBar` and `useGlobalCommands` pass `value.pageOrder[moduleId]` from
  `useShellSettings`.
- Dropping a drag writes `patch` of that module’s id list only. **Done.**

## Task 4: PageBar drag

- Desktop (`md+`) only: `draggable` on the tab control, column-header-style `dragstart` /
  `dragover` / drop, insertion line, `cursor-grab`.
- Keep `NavLink` (real URL). Suppress the browser’s default URL-drag; a completed drag
  must not navigate.
- Below `md`: unchanged scrollable underline row, no `draggable`.
- `aria` stays tab-as-navigation (`aria-current="page"`). Do not turn the bar into a
  `role="tablist"` of form tabs. **Done.**

## Task 5: Verify, freeze spec, update roadmap

- `npm run test:unit` (pageOrder, shell parse, pages default-order). Integration not
  required unless settings mutations change.
- After any `src/app/**` touch: dev server + `npm run smoke`.
- Browser: drag on Plan (7) and Finances (11); reload; palette order; 390px no-drag;
  new-page merge via a unit case if no live new page.
- Update this spec for as-built drift; **Changes from original plan**; status
  **frozen / complete**; short roadmap note under Module pages. **Done.**

## Follow-ups (new work — not amendments to this frozen spec)

- Explicit Move left/right (or equivalent) on the phone, if daily use needs a reorder path
  without a desktop. Recorded deviation from `responsive.md`.
