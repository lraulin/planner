# Navigation & Command Surface

**Status: frozen / complete** (2026-08-05)
Spec folder: `agent-os/specs/2026-08-05-0838-navigation-and-command-surface/`

## Context

`src/components/shell/tabs.ts` holds eleven views in one flat list, rendered by `TabStrip`
as a single non-wrapping row of persistent, uncloseable tabs. The roadmap adds more —
Result Areas, Life Plan, Overview, Time Charts, Resources, Pomodoro / time tracking,
reports — and the row has nowhere to go.

Achieve Planner never had this problem. Its **Go** menu was the real navigation (manual
§1.3: _"You can access all the tabs using the Go menu"_), and tabs were a working set you
opened, rearranged, and closed. We inherited the tabs without the Go menu, so the tabs had
to become permanent — a set that could only ever grow.

The other half is commands. Achieve's **Actions**, **Tools**, **View**, and **Outline**
menus hold capabilities we still need — View Tasks / View Project, Schedule Block, Set /
Skip Recurrence, Reschedule, New Project from Template, Options, import / export — and
today they have nowhere to go except more always-visible toolbar buttons. `GridToolbar`
already shows the strain: Filter, Group by, Collapse all, the tab's switches, Show Fields,
Density, Reset this grid, Rename, and Open are all permanently on screen.

**Outcome:** a left sidebar that scales to twenty views, a `⌘K` palette that _is_ the Go
menu plus every command, and a `⋯` overflow that keeps every command visibly reachable
without occupying the toolbar. No new features — this is chrome.

## Decisions

| Decision             | Choice                                                                                                                                                                                                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Desktop navigation   | A collapsible left sidebar, views grouped into named sections. `TabStrip` is deleted. Vertical space is what we have and horizontal space is what ran out.                                                                                                               |
| The Go menu          | A `⌘K` command palette listing views and commands in one index. This is Achieve's Go menu, rendered the way 2026 renders it.                                                                                                                                             |
| Command home         | **One registry, two renderers**: the palette, and a `⋯` overflow on the active view's toolbar. Nothing is palette-only — `ux-principles.md` forbids a command reachable by shortcut alone, and touch has no `⌘K`.                                                        |
| Phone                | Shape unchanged: bottom nav plus More sheet. The More sheet gains the sidebar's section grouping. `⋯` is the touch path to commands.                                                                                                                                     |
| Future views         | Their section is decided **now** and recorded in the registry as reserved entries. A section renders only when it holds at least one built view, so a reserved slot is data, not chrome.                                                                                 |
| No desktop title bar | The shaping sketch showed a `Tasks … [⋯]` header row. Skipped: the sidebar already says where you are, and a full-width row costs grid rows on every view forever. `⋯` goes on the view's existing toolbar. Phone keeps `MobileHeader`, which has no sidebar to lean on. |
| Sidebar state        | Persisted in `user_settings` under a new singleton scope `shell`. Settings already load in `src/app/layout.tsx`, so the collapsed rail server-renders collapsed rather than flashing expanded first.                                                                     |
| Not an open-set      | Closable / reorderable / persisted tabs were the faithful option and were rejected: the sidebar plus the palette covers the working-set need without an open-set state machine, an empty state, and a migration.                                                         |

### Sections

| Section            | Built today                                | Reserved                         |
| ------------------ | ------------------------------------------ | -------------------------------- |
| _(ungrouped, top)_ | —                                          | Overview                         |
| **Plan**           | Outline, Goals, Projects, Tasks, Wish List | Result Areas, Life Plan          |
| **Do**             | Day, Task Chooser, Weekly Schedule         | Focus timer (Pomodoro)           |
| **Track**          | Metrics, Fitness, Notes                    | Time log, Reports                |
| **Library**        | —                                          | Time Charts, Resources, Contacts |

Settings and Sign out stay pinned at the bottom of the rail, outside the sections — they
are not views.

## Acceptance criteria

- [x] The desktop sidebar shows every built view, grouped, with the current one highlighted;
      `TabStrip` and `tabs.ts` are gone.
- [x] Collapsing the sidebar gives an icon rail, and a reload comes back collapsed **with no
      flash of the expanded rail** — verified at the source: the first HTML off the server
      carries `w-12`, not a class swapped in after hydration.
- [x] `⌘K` opens a palette; typing a view name and pressing Enter navigates there (`sched` →
      `/schedule`).
- [x] The palette also lists the commands the active view registered, and running one works.
- [x] `⋯` on a grid toolbar shows the contextual commands, minus those with their own button.
      One registry, so the two surfaces cannot disagree.
- [x] `Reset this grid` and `Show Fields` have left the always-visible toolbar for `⋯`, and
      still work.
- [x] `c` still opens quick capture; `⌘K` does not fire while a dialog is open (verified: with
      capture open, `⌘K` leaves exactly one dialog on screen and it is still Quick capture).
- [x] At 390px the bottom nav is unchanged, the More sheet is grouped by section, and `⋯` is
      pinned outside the scrolling toolbar at 44 × 44.
- [x] A section with no built views does not render (`Library` is invisible).
- [x] `npm run test:unit` (1261 in 93 files), `typecheck`, `lint` and `build` are clean.

**Not met, and pre-existing:** the compact layout still reports `documentElement.scrollWidth`
903 against a 390 client width. Measured on `master` with these changes stashed: **identical**.
Not caused here and not fixed here; it is its own bug.

**Integration tests did not run.** `npm run test:unit` excludes `*.integration.test.ts` by
script, not by a skip. Nothing in this change touches `mutations.ts` or `queries.ts` — the one
new scope is a row in the existing `user_settings` table — so there is no DB behaviour to cover.

## Changes from original plan

Material refinements during implementation (requirements, design, scope). Pure code polish
is omitted.

| #   | Change                                                                                                              | Why                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Added `Command.hasOwnControl` and `overflowCommands()`, so the palette and `⋯` show different subsets of one list.  | Not in the plan, and needed as soon as real commands landed. The palette must be **complete** — a Go menu you cannot trust is not one — but `⋯` must be **short**, or it reprints Filter and Open directly beneath the Filter and Open buttons and becomes the clutter this spec removes. Same registry, two questions: "what can this app do" versus "what _else_ can this view do".                                                                                                                                                                                                                                                         |
| 2   | The row context menus were **not** converted into registered commands, apart from `Copy as text`.                   | The plan said each grid's row menu "becomes registration rather than a second hand-built list". On reading all six builders, that is a larger refactor than the rest of this spec combined — each carries its own per-row enable/disable logic — for almost no user-visible gain: every entry already has a right-click path on desktop and a long-press one on touch, so none of them is broken under `ux-principles.md`. The exception is `Copy as text`, which had **no** button anywhere, only `⌘C` and right-click; it is registered in `useGridTab`, covering Projects, Tasks and Goals at once. Converting the rest is follow-up work. |
| 3   | Four views get no `⋯` button: Day, Weekly Schedule, Metrics, Fitness.                                               | They render no `GridToolbar` and register no commands, and `OverflowMenu` returns `null` on an empty list — a button whose menu is empty reads as broken rather than as absent. The palette still reaches every global command from those views.                                                                                                                                                                                                                                                                                                                                                                                              |
| 4   | `TabToolbar` gained a `pinned` slot, and `⋯` lives in it rather than at the end of the scrolling row.               | Found in the browser at 390px: the button was at **x ≈ 1884** inside the toolbar's `overflow-x-auto`, so reaching the phone's only command surface meant panning past every other control. A command surface you get to that way is one you do not have. Pinned outside the scroller it sits against the right edge at 44 × 44.                                                                                                                                                                                                                                                                                                               |
| 5   | Keyword matching is by **word prefix**, not subsequence over the whole keyword string.                              | Also found in the browser: typing `sched` listed **Settings**, whose keywords contain no such word — a subsequence match across a forty-character haystack succeeds for almost any short query. A palette that answers questions you did not ask is one you stop trusting.                                                                                                                                                                                                                                                                                                                                                                    |
| 6   | Fixed a pre-existing identity churn in `useGridTab`'s `order`, and added a dev-only guard to `useRegisterCommands`. | The first browser run was an infinite render loop. `order` had been rebuilt on every render for months — harmless until something depended on its identity, at which point registering commands re-rendered the caller, which rebuilt the array, which re-registered. `order` is memoised now, and the hook names the mistake in the console after 20 identical re-registrations instead of hanging the tab.                                                                                                                                                                                                                                  |

## Task 1: Save spec documentation

This folder: `plan.md`, `shape.md`, `standards.md`, `references.md`.

## Task 2: View registry, sidebar, shell settings scope

- `src/components/shell/views.ts` replaces `tabs.ts`. Each view carries `id`, `label`,
  `href`, `section`, `icon`, `primary` (phone bottom-nav slot), `status: "built" |
"reserved"`. Sections are an ordered constant. `viewLabel(id)` replaces `tabLabel(id)`.
- `src/components/shell/Sidebar.tsx` — sections, active highlight, collapse toggle;
  collapsed is a ~48px icon rail with `title` tooltips.
- `src/components/shell/navIcons.tsx` gains an icon per view (three exist today).
- `src/lib/settings/shell.ts` + `shell.test.ts` — `{ sidebarCollapsed: boolean }` codec,
  modelled on `src/lib/settings/drawer.ts`.
- `src/lib/settings/scopes.ts` — `"shell"` joins `SCOPE_KINDS` as an unkeyed kind (like
  `drawer`), with `SHELL_SCOPE` and a `KIND_LABELS` entry so the reset page can label it.
- `AppShell` becomes sidebar + content above `md`. Delete `TabStrip.tsx` and `tabs.ts`;
  migrate the fourteen `AppShell active=` call sites (`TabId` → `ViewId`).

## Task 3: Command registry, palette, overflow menu

- `src/lib/commands/registry.ts` + `registry.test.ts` — the `Command` type, the global
  command list, and the match / rank function the palette filters with. Pure logic, so this
  is where the tests live (`testing.md`).
- `src/components/shell/CommandProvider.tsx` — `useRegisterCommands(commands)` for a view to
  publish its own; `useCommands()` for the two renderers to read them.
- `src/components/shell/CommandPalette.tsx` — `⌘K`, built on `ModalShell`. Go-to-view
  entries generated from the registry (`status: "built"` only).
- `src/components/shell/OverflowMenu.tsx` — the `⋯` button, rendering `useCommands()`
  through the existing `ContextMenu`, which already handles keyboard nav, the shortcut
  column, separators, disabled items, and edge flipping.

## Task 4: Wire existing commands

Global: go to each built view, Quick capture (`c`), Settings, Sign out, Plan Week…, Reset
everything, and the `/settings` import / export panels as go-to entries.

Contextual, registered by the view: Rename (`F2`), Open (`Enter`), Reset this grid, Show
Fields, Filter…, Collapse / Expand all, plus each grid's existing row context menu — which
becomes registration rather than a second hand-built list.

`GridToolbar` gains `⋯` and moves **Reset this grid** and **Show Fields** behind it. Filter,
Group by, switches, Density and Rename / Open stay on the bar.

## Task 5: Phone pass

`MoreSheet` groups by section; the overflow menu has a tap-sized path; verify at 390px.

## Task 6: Standards

- **New** `agent-os/standards/components/navigation.md` — the sidebar / palette / `⋯` triad,
  the one-registry rule, and the "no command is palette-only" rule.
- `components/responsive.md` — the `md` table calls the tab strip part of the instrument;
  it becomes the sidebar, plus a sidebar ↔ bottom-nav row.
- `components/ux-principles.md` — **Layout & Navigation** points at `navigation.md`.
- `components/data-grid.md` — record the toolbar's new overflow tier, so the existing
  toolbar-restraint tests know where a rarely-used control belongs.
- Re-run `/index-standards`.

## Task 7: Verify, freeze spec, update roadmap

- `npm run test:unit` (watch for the Postgres skip warning), `typecheck`, `lint`, `build`.
- Browser verification via the `run-planner` skill against the acceptance criteria above.
- Complete **Changes from original plan**; set **Status: frozen / complete**; list
  follow-ups as new work; update `agent-os/product/roadmap.md`.

## Out of scope

- **New views**, and any Achieve command not yet implemented (Reschedule, New Project from
  Template, Skip Recurrence, Convert to Task / Project). The reserved sections name where
  they will go; nothing stubs them into the UI, because a menu full of dead entries teaches
  the user to stop reading the menu.
- **Closable / reorderable / persisted open tabs.** See the decision above.
- **Electron or any desktop packaging.**

## Follow-ups (new work — not amendments to this frozen spec)

- **Row context menus as registered commands.** Six builders (`useGridTab`, `OutlineGrid`,
  `NotesGrid`, `WishesGrid`, `MetricsView`, `DailyItemsGrid`) still hand-build `MenuItem[]`
  per row. Converting them would put every row command in the palette. See change #2 for why
  it was not done here.
- **`⋯` on the four views without a `GridToolbar`** — Day, Weekly Schedule, Metrics, Fitness —
  once any of them has a command worth registering.
- **Compact horizontal overflow.** Pre-existing, measured against `master`, unrelated to
  navigation. Worth its own spec.
- **Deep links into the settings panels.** The import/export panels head with `useId`, so the
  palette can only land you on the page. Stable anchors would let `Import from Achieve` be its
  own command.
- **Reserved views.** Overview, Result Areas, Life Plan, Focus Timer, Time Log, Reports, Time
  Charts, Resources, Contacts each have a section already; building one is now a `status`
  change plus an icon.

---

> **Frozen.** Further change in this area opens a new delta-spec rather than editing this
> folder.
