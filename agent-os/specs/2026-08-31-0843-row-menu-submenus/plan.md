# Compact row-menu submenus

**Status: frozen / complete** (2026-08-31)  
Spec folder: `agent-os/specs/2026-08-31-0843-row-menu-submenus/`

This document is the durable record of **what was built and why**. Further change to
the row menu's folds opens a new delta-spec rather than editing this folder.

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-06-1506-right-click-completion/` — one `rowMenuFor` builder, `NESTED_SECTIONS` declared not derived from length, floor of two, blank-area menu is the row menu with no row, fly-out on desktop / drill-in on touch, Commands panel stays expanded.
- **Extends:** `agent-os/specs/2026-08-06-1010-command-surface/` — one registry, placement is a property of the command.
- **Supersedes:** `agent-os/specs/2026-08-06-1506-right-click-completion/` decision 2 / `navigation.md` “A family folds behind one row” — **only** the clause that `Move` stays flat. `Item` and `Danger` stay flat. `Go` is a new nestable family split out of `Item` so we do not nest the Item menu itself.

## Context

The Outline right-click menu is ~30 rows (`visuals/outline-row-menu-before.png`). `Convert to`, `Insert row` and `State` already nest. Everything else in `Item` (12 verbs) and `Move` (5–6 verbs) is inline, and `Expand` / `Priority` / `Zoom` each contribute a heading plus one command because their sibling commands were never opted into `rowMenu`.

Achieve’s outline menu stayed short by keeping frequent verbs at the top and nesting `Insert ▸` / `Outline ▸` / `Actions ▸`. We keep our section names and match that shape.

Product: `mission.md` — default when ambiguous is Achieve; this is a deliberate UX compaction of a catalog that already exists, not new verbs.

## Decisions

1. **Keep at the top of the row menu:** Open, Rename, Complete, Schedule block…, Cut, Paste, Paste as child, Copy as text, Add attachment from clipboard, Delete. These are the verbs someone opened the menu for. `Item` and `Danger` stay out of `NESTED_SECTIONS`.
2. **Nest `Move ▸`.** Add `"Move"` to `NESTED_SECTIONS`. Members: Move up, Move down, Indent, Outdent, Move to…. Floor of two still applies, so a host with a single move command stays inline. Organize ▾ shows `Move ▸` too.
3. **Split the Item leftovers into `Go ▸`.** `record.view-tasks`, `record.view-project`, `record.view-in-outline` change `section` from `"Item"` to `"Go"`. Add `"Go"` to `MENU_SECTIONS.item` (after `Item`, before `Convert to`) and to `NESTED_SECTIONS`. Item ▾ shows `Go ▸` rather than three inline jumps. A host with only one of them stays inline.
4. **Opt Expand / Zoom siblings onto the row menu** so those sections actually nest (they are already in `NESTED_SECTIONS`, but the row menu currently has one member each):
   - Expand: Expand/Collapse selected, Expand all items, Collapse all items, Expand through level… (`rowMenu: true` on the view-level ones).
   - Zoom: Zoom in, Zoom out, Clear zoom, Zoom to item….
     Grey Zoom out / Clear zoom when not zoomed (`"Not zoomed in"`). Thread a `zoomed` flag through `outlineZoom` capabilities from `OutlineGrid`.
5. **Drop `Select all` from the row menu.** Remove `rowMenu: true` on `record.select-all`. It remains in Item ▾, the Commands panel, `⌘K`, and `⌘A`. A row menu answers “what can I do to this row”; select-all does not.
6. **Skip the section heading when a non-nested section has one command.** Height, not taxonomy: `New`, `Set priority…` and `Delete` already name themselves. Implement in `menuItemsFor` only — the Commands panel keeps the heading because it is the tree left open. Nested sections already render as one row and do not get a heading.
7. **Same folds everywhere.** Row menu, menu bar, `⋯`. Commands panel still expands nested families as headed groups. No Outline-only exception.
8. **No new mutations, no new commands.** Placement and heading only, plus the `zoomed` disabled reason.

### Target Outline row menu

```
ITEM
  Open
  Rename
  Complete
  Schedule block…
  Cut
  Paste
  Paste as child
  Copy as text
  Add attachment from clipboard
Go ▸
Convert to ▸
────────
New
Insert row ▸
────────
Move ▸
State ▸
Expand ▸
Set priority…
Zoom ▸
────────
Delete
```

Blank-area menu: same list; item verbs greyed with their reason; New, Expand all / Collapse all / Expand through level…, Zoom to item… live; Zoom out / Clear zoom greyed when not zoomed.

### Out of scope

- Undo / Redo, Record Work / Expenses, paste-as-duplicate (already follow-ups on the parent spec).
- Nesting `Item` or `Danger`.
- Commands panel folding.
- Adding or removing verbs other than taking Select all off the row menu.
- Rebindable shortcuts / customisable command row.
- A dedicated height-cap bugfix, unless verification shows the existing viewport clamp still overflows after this shortening.

## Acceptance criteria

- [x] Outline row menu matches the target sketch: frequent verbs at the top, `Go ▸` / `Move ▸` / `Expand ▸` / `Zoom ▸` nested, Select all absent, Delete still last and visible.
- [x] `Move ▸` and `Go ▸` appear on every surface that shows those sections (row menu, Item/Organize menus, `⋯`). Commands panel still lists the members under headings.
- [x] A host with only one Go or Move command does not nest that section (floor of two).
- [x] Expand all / Collapse all / Expand through level… and Zoom out / Clear zoom / Zoom to item… are on the Outline row menu. Zoom out and Clear zoom are disabled with “Not zoomed in” when `zoom` is null.
- [x] Select all still runs from Item ▾, `⌘K`, and `⌘A`.
- [x] `menuItemsFor` does not emit a heading for a one-command un-nested section; the Commands panel still does.
- [x] Unit tests in `menus.test.ts` and `commandDeck.test.ts` cover the new nests, the floor, Select all’s `rowMenu` absence, and the zoomed disabled reason. No new integration tests (no mutation path).
- [x] Browser: `/outline` right-click a row at 1280×800 (menu ~619px in an 800px viewport; dock still visible) and 390×844 (sheet; drill into Move and back). `/tasks` and `/projects` row menus show `Go ▸` for the families they have. Organize ▾ and Item ▾ match. `npm run test:unit`, typecheck, lint. No `src/app/**` change, so no smoke.

## Changes from original plan

Material refinements during implementation (requirements, design, scope). Omit pure
code polish.

| #   | Change                                                                | Why                                                                                                          |
| --- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 1   | Wish List's `record.view-in-outline` page command also moved to `Go`. | It overrides the built-in by id; leaving `section: "Item"` would have kept that host's jump out of the nest. |

## Follow-ups (new work — not amendments to this frozen spec)

- Undo / Redo, Record Work / Expenses, paste-as-duplicate remain the parent spec's follow-ups.
- A dedicated viewport-clamp bugfix was not needed: after shortening, the Outline row menu is ~619px in an 800px window and the hint bar stays visible.

## Task 1: Save Spec Documentation ✓

This folder: `plan.md`, `shape.md`, `standards.md`, `references.md`, and `visuals/outline-row-menu-before.png` (gitignored; described in `references.md`).

## Task 2: Declare Go and nest Move ✓

`src/lib/commands/menus.ts`:

- Add `"Go"` to `MENU_SECTIONS.item` (after `"Item"`, before `"Convert to"`).
- Add `"Move"` and `"Go"` to `NESTED_SECTIONS`. Rewrite the comment: fold families whose name is the useful thing **and** `Move`, whose five verbs were dominating the row menu the way Convert to’s five kinds used to. Item and Danger remain absent.

`src/lib/grid/commandDeck.ts`: set `section: "Go"` on `record.view-tasks`, `record.view-project`, `record.view-in-outline`. Leave `menu: "item"`.

Tests in `menus.test.ts` and `commandDeck.test.ts`:

- Outline-shaped command list: row-menu section labels and which of them have `submenu: true`.
- A single Go or Move command stays inline.
- Organize ▾ marks Move as a submenu; Item ▾ marks Go as a submenu.
- The existing “leaves the verb families flat” test still pins Item and Danger, no longer Move.

## Task 3: Expand / Zoom on the row menu, zoomed reason ✓

`commandDeck.ts`: `rowMenu: true` on `view.expand-all-items`, `view.collapse-all-items`, `view.expand-through-level` (and the 1–9 variants if a host still emits those), `outline.zoom-out`, `outline.zoom-clear`, `outline.zoom-to-item`.

Change `outlineZoom?: boolean` so a true flag can also carry zoom state — e.g. `outlineZoom?: boolean | { zoomed: boolean }` — and disable Zoom out / Clear zoom with `"Not zoomed in"` when not zoomed. Unavailable, not absent.

`OutlineGrid.tsx`: pass `{ zoomed: zoom !== null }` (or equivalent) from the existing `zoom` setting.

Tests: Outline capabilities produce nested Expand and Zoom on the row menu; zoom-out/clear disabled with that reason when `zoomed` is false and live when true.

## Task 4: Select all off the row menu; skip one-command headings ✓

- `record.select-all`: drop `rowMenu: true`. Assert it is still in `buildMenus` Item section and absent from `rowMenuSections`.
- `menuItemsFor`: if a section is not a submenu and has exactly one command, do not emit `{ heading }`. Separators between sections stay. Nested rows still skip a heading (already). Consecutive-submenu separator rule unchanged.
- Because `menuItemsFor` lives in `ContextMenu.tsx`, extract the heading decision into a tiny pure helper under `src/lib/commands/` (or test via `rowMenuSections` + a new `menuRowsFor` if that is cleaner than putting UI-row logic in menus.ts). Do not add a React component test.

## Task 5: Update `navigation.md` ✓

Amend **A family folds behind one row**:

- `Move` now nests. The old “Move stays flat” sentence is replaced: movement is a family whose name is the useful thing once it is five verbs; burying `Delete` is still hiding it, so `Item` and `Danger` stay flat.
- Document `Go` as the nest for View tasks / View project / View in Outline.
- Document the one-command heading skip as a row-menu / menu-bar concern, not a Commands-panel one.

Do not copy the standard into the spec.

## Task 6: Verify, freeze spec, update roadmap ✓

Per `run-planner`:

1. `/outline` — right-click a project with children: target sketch; open Move / Go / Convert to / Expand / Zoom with mouse and `→`; Select all absent; Delete last. Right-click blank space: New live, item verbs greyed, Zoom out greyed when not zoomed. Zoom in, then confirm Zoom out is live.
2. `/tasks` and `/projects` — same nests for the families they have; floor of two on a host with a single Go command.
3. Item ▾ shows `Go ▸`; Organize ▾ shows `Move ▸`. Commands panel still lists Move / Go members under headings.
4. 390×844 — long-press; drill into Move and back.
5. `npm run test:unit` (watch for the Postgres skip), `npm run typecheck`, `npm run lint`. Smoke if `src/app/**` changed.

Then freeze the spec folder, append any as-built drift to **Changes from original plan**, and add a Phase 1 delivered line on `agent-os/product/roadmap.md` under the existing right-click completion bullet (this is compaction of that surface, not a new one).

---

> Frozen. Further change to these folds is a new delta-spec, not an edit to this folder.
