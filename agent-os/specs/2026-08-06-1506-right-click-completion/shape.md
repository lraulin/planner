# Right-Click Completion — Shaping Notes

**Status: frozen / complete (2026-08-06)**

## Scope

Finish the right-click surface. The previous slice
(`agent-os/specs/2026-08-06-1010-command-surface/`) made one command registry drive every menu,
which is why right-click already _works_ on all twelve `DataGrid` hosts, on `MetricsView`'s
bespoke table, and on the column headers. This slice is about the content it carries and the
places it does not reach.

Seven concrete gaps, all found by diffing the app against `visuals/`:

| #   | Gap                                                                                                                 | Where                                                              |
| --- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| 1   | The Outline builds its row menu from a _second_, narrower capabilities object — no Convert to, no Priority, no Zoom | `src/components/outline/OutlineGrid.tsx:550-595`                   |
| 2   | No submenus, so `Convert to`'s five rows were kept off the row menu entirely                                        | `src/lib/commands/menus.ts`, `src/components/grid/ContextMenu.tsx` |
| 3   | Right-clicking blank grid space falls through to the browser menu                                                   | `src/components/grid/DataGrid.tsx`                                 |
| 4   | The Schedule week calendar has no right-click at all                                                                | `src/components/schedule/WeekCalendar.tsx`                         |
| 5   | Missing command families: Complete, Schedule block, View project / View tasks, row clipboard                        | `src/lib/grid/commandDeck.ts`                                      |
| 6   | `responsive.md` promises a bottom sheet on touch; long-press opens the positioned popup                             | `src/components/grid/ContextMenu.tsx`                              |
| 7   | Only `Copy as text` reflects the selection count                                                                    | `src/lib/grid/commandDeck.ts`                                      |

### Out of scope

- **Undo / Redo.** Every Achieve menu leads with them, but the app has no undo system at all.
  That is a feature, not a menu row.
- **Record Work / Expenses** (`Ctrl+K` in the screenshots) — no time or expense model exists.
- **Paste-as-duplicate.** Cut+paste is `moveNode`, which already exists. Deep-copying a subtree
  is new server work; see `plan.md` Task 7.
- **Right-click on the secondary panels** — sidebar nav, Projects rail, MiniMonth, the Time
  Chart editor, Fitness, the Weekly Plan wizard.
- **`View Month Calendars` / `Project Explorer` toggles.** Achieve's were _show_ commands for
  panels hidden by default; ours is one `hidden md:flex` aside that is always up on desktop, so
  a toggle would be a panel-visibility feature rather than a menu row.

## Decisions

1. **One row-menu builder, no exceptions.** The Outline adopts `rowMenuFor`. Its reason for
   being bespoke — per-row legality flags and per-row action closures — is precisely what
   `capabilitiesFor(id, count)` already gives `useNodeCommandDeck`'s five hosts.
2. **Submenus are declared per section, not derived from length.** A section label in
   `NESTED_SECTIONS` nests, so `Convert to ▸` looks the same on the Outline and on Tasks, and on
   the menu bar as well as the row menu. A pure length threshold was considered and rejected: the
   same family nesting on one view and lying flat on another is a menu you have to read every
   time. The one length condition that survived is a floor of two — a fly-out onto a single row
   is a hover you must perform to learn nothing was behind it.
3. **The blank-area menu is the row menu with no row.** `rowMenu` becomes
   `(rowId: string | null) => MenuItem[]`. Every item verb is already `disabled` with
   "Select a row first", and `navigation.md` says unavailable is not absent — so the blank menu
   is the same menu, greyed, and there is no second list to drift. Creation is the one command
   on it that does not need a row, which is what keeps it worth opening.
4. **The calendar's menu is built from `Command`s.** Not a hand-written `MenuItem[]` — that is
   the exact drift the previous slice removed from eight views. Registering them also puts them
   in `⌘K`, the menu bar and `⋯` for free.
5. **Cross-navigation reuses the scope selects that already exist.** Tasks, Projects and Goals
   each hold a `scopeId` in local `useState`. Promoting it to `?scope=` makes `View tasks…` a
   plain navigation _and_ fixes a real bug: today the scope does not survive reload or Back.
6. **The row clipboard is a move, not a copy.** Achieve's `Pickup Row(s)` marks rows for
   relocation, and `moveNode` already reparents, repositions and rejects cycles — so cut+paste
   needs no new mutation.
7. **Plural labels only where the action is honestly plural.** Delete, the state changes and Cut
   act on the whole selection and say so. Open, Rename, Indent and Convert stay single-row;
   opening three drawers is not a thing.
8. **On touch the sheet drills in; on desktop it flies out.** A 390px screen has nowhere to put
   a fly-out.

## Context

- **Visuals:** `visuals/` — five Achieve captures supplied by the user, explicitly _as a guide to
  the functionality to expose_, not as a visual target to reproduce. The chrome (2003-era Windows
  menus, `Ctrl+` shortcut strings) is deliberately not copied; the command vocabulary and the
  nesting are.
- **References:** see `references.md`.
- **Product alignment:** continues the UI/UX standardisation thread that runs through
  `2026-08-05-0838-navigation-and-command-surface`, `2026-08-05-2121-command-deck-and-item-actions`
  and `2026-08-06-1010-command-surface`. The last of those listed "right-click menu expansion" as
  its first follow-up, in exactly these terms: submenus in `ContextMenu`, and the Outline's row
  menu missing its Priority and Zoom sections.

## Standards Applied

- **components/navigation.md** — the surface taxonomy this extends: complete-everywhere,
  sectioned-everywhere, "unavailable is not absent", and the rule that no command is
  palette-only. Submenus become a fourth structural device inside it.
- **components/data-grid.md** — `rowMenu`'s contract on `DataGrid`, and the toolbar tier table.
- **components/responsive.md** — long-press replaces right-click; the row menu is a bottom
  sheet; nothing reachable only by right-click. Gap 6 is this standard not being met.
- **components/ux-principles.md** — single tap opens, long press opens the row menu; the
  touch-reachability checklist.
- **development/testing.md** — pure logic in `src/lib/**` with an adjacent test; no React
  component tests; anything touching the database gets a two-user integration test.
- **product/date-model.md** and **development/dates.md** — the calendar menu resolves an instant
  under the pointer and the Schedule block command names a week, so both touch the date rules.
