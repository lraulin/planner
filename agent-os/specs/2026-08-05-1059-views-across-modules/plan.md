# Views Across All Modules

**Status: frozen / complete** (2026-08-05)
Spec folder: `agent-os/specs/2026-08-05-1059-views-across-modules/`

Delta-spec over the frozen
[`2026-08-05-0230-saved-views`](../2026-08-05-0230-saved-views/), which built the mechanism on
three grids and left it opt-in.

## Context

Saved views work: `lib/settings/views.ts` holds the catalogue, `useSavedViews` the commands,
`ViewPicker` the control. A view is a column order, a filter map and a grouping; `views:{tabId}`
says what a view **is** and `grid:{tab}.{id}` how you have since adjusted it.

Three things stop it from being a feature of the app rather than of three grids:

1. **Coverage is 3 of 8 grids.** Wired in `GoalsGrid`, `ProjectsGrid`, `TasksGrid` — each
   repeating the same four-step dance in its own body. Outline, Wishes and Notes have no view
   concept at all. Chooser has built-in views but no way to make one. The Metrics tracking grid
   has a field set and no way to name one.
2. **The CRUD is incomplete.** `useSavedViews` already implements `rename` and **nothing calls
   it**; `ViewPicker` offers only Save and Delete. There is no update-in-place, so adjusting a
   saved view and keeping the adjustment is impossible — Save always mints a new view.
3. **A view drops the settings that actually distinguish one setup from another.** On Outline
   that is the Area/Goal level toggles; on Chooser it is the weights, which is _the_ thing
   Achieve's Chooser view controls (`useChooserSettings` already says so: "Achieve keeps
   separate scoring settings for each view, and so do we"). A view that captures three
   universal settings and none of the module's own is a view of the wrong thing.

**Outcome:** every main grid gets create / update / rename / delete views through one shared
control; a view carries the module's own settings; and `View` stops naming two different
concepts in the code.

## Decisions

| Decision                                                               | Choice                                                                                                                                                                                                                                                                                                       |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Nav destinations are **Modules**                                       | `VIEWS` in `shell/views.ts` (Outline, Tasks, …) and `VIEWS` in `GoalsGrid.tsx` (All, Active, Completed) are two concepts under one name. Achieve called the in-grid presets Views, and so do the UI, this standard and every call site — so **View keeps its in-grid meaning** and the nav layer is renamed. |
| Rename stops at the nav layer                                          | `tabId` parameters, `components/tabs/` and every **storage key** (`grid:{tab}`, `views:{tabId}`) are untouched. Renaming a persisted scope key is a data migration bought for nothing.                                                                                                                       |
| Module settings ride in **view-id-keyed scopes**, not an `extras` blob | Two of the three cases already work this way. See the table below. A module declares them as `viewScopes` so saving a view **forks** them — see change 4; keying alone is not enough.                                                                                                                        |
| `SavedView.switches`                                                   | Grid switches are already an open `Record<string, boolean>` in `GridSettings`. A view records positions; the switch stays a switch.                                                                                                                                                                          |
| `SavedView.base`                                                       | The built-in a saved view derives from. Chooser resolves _behaviour_ from the view id, and `saved-a1b2c3d4` is not a `ChooserViewId`.                                                                                                                                                                        |
| **No `SETTINGS_VERSION` bump**                                         | Filters needed nullability because `Clear all` is a whole-map operation. A switch is independently keyed, so per-key fallback expresses every state without a null map.                                                                                                                                      |
| A module's default view keeps the **bare** grid scope                  | `GridSettings.view` is already `string \| null` with null meaning "the module's default", so Outline/Wishes/Notes/tracking keep writing `grid:outline` and no stored layout is orphaned.                                                                                                                     |
| View commands go behind `⋯`, not into a new menu                       | Four commands plus a select is more toolbar than `data-grid.md`'s three-tier table allows. The select stays on the bar; Save / Update / Rename / Delete are registered commands.                                                                                                                             |
| `includeDeferred` stays **out** of a view                              | `data-grid.md` puts it deliberately on the tab scope, not the view. Nothing here changes that.                                                                                                                                                                                                               |

### Where each module's own settings live

| Settings                                                                       | Where they live now                       | How a view captures them                                                                           |
| ------------------------------------------------------------------------------ | ----------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Outline Area/Goal, Next Actions, Show Purpose, Include Goals, Advanced Filters | `GridSettings.switches`                   | New `SavedView.switches`, merged **under** the grid's own map                                      |
| Chooser weights + flags                                                        | `chooser:{viewId}` — **already per view** | Free: a saved id is a legal scope key, so `chooser:saved-a1b2c3d4` exists the moment the view does |
| Notes mode / sort / filter                                                     | singleton `notes:filter`                  | Move to `notes:{viewId}`, the shape Chooser already uses                                           |

### Why this does not contradict "Next actions is a switch, not a view"

That standing decision says a view must be "a collection of settings you could have reached one
at a time — the moment it also carries a setting available nowhere else, picking the view is
the only way to get the behaviour". Nothing here changes that: every switch stays on the
toolbar, independently toggleable, and combinable with any view. A saved view records where the
switches were, exactly as it records which columns were showing. The rule forbids a view that
_owns_ behaviour, not a view that remembers a setting.

## Acceptance criteria

All verified in the running app on 2026-08-05 (`run-planner`); evidence in brackets.

- [x] Every main grid — Outline, Projects, Goals, Tasks, Wishes, Notes and Chooser — can
      create, update, rename and delete named views (the Metrics tracking grid is out; see
      change 2)
- [x] Saving a view on Outline with Areas dissolved and reloading returns the dissolved outline
      [after reload: view "Dissolved areas", `Areas=false`, top rows `Project: <Inbox>` — the
      result areas stay dissolved]
- [x] Two Chooser views with different weights score the same tasks differently, and switching
      between them switches the scoring [top item **244** on the built-in vs **124** on the
      saved view — exactly the `deadlineOverdue: 120 → 0` change. The _order_ did not move,
      correctly: 124 still beats the 114 behind it]
- [x] Saving a view carries the module's own settings [Notes saved from Flat opens on Flat;
      a Chooser view forked from modified weights scores 124, not the base's 244 — change 4]
- [x] `Update view` writes the current grid back to the view you are on; `Reset this grid` then
      returns to that, not to the built-in preset [`Areas` off, saved, toggled on, Reset →
      off; then Update with it on, Reset → **on**. The declared `defaultOn` is `true`, so the
      first half also proves the view's position beats the tab's default]
- [x] Renaming a view keeps its id, its grid scope and its position in the picker ["Dissolved
      areas" → "Projects only", still selected, still third in the list, switches intact]
- [x] Deleting the view you are sitting on falls back to a built-in rather than stranding the
      grid [falls back to "Full Outline", 67 rows still render, and no orphan
      `grid:outline.{deleted-id}` row is left behind]
- [x] Existing `grid:outline` / `grid:wishes` / `grid:notes` column layouts still load [the
      bare scopes are still the ones written; no `grid:outline.outline` row was created]
- [x] `base` always names a built-in [a view saved _from_ a saved view stored
      `base: best-overall`, not the intermediate id]
- [x] `VIEWS`/`ViewId` no longer name both a destination and a grid preset

## Changes from original plan

Material refinements during implementation (requirements, design, scope). Omit pure code polish.

| #   | Change                                                                                            | Why                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | View commands go behind `⋯` as registered commands rather than into a new `View ▾` menu           | `data-grid.md`'s three-tier table already answers this: a real command used occasionally belongs behind `⋯`, where `Show Fields` and `Reset this grid` already are. A bespoke menu would have been a fourth tier invented to avoid reading the table.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 2   | **The Metrics tracking grid is dropped from scope** (Task 8 not built)                            | `TRACKING_COLUMNS` has four columns and two of them are `hideable: false`, so a view there could only ever vary _two booleans_ — four reachable states, named and managed through a picker, Save, Update, Rename and Delete. Task 8 was written with "drop it if this reads as ceremony once built" and it does. Two further reasons found while wiring it: the grid is a hand-rolled `<table>` that supports no filters, grouping or switches, so a view could capture nothing else; and `ViewPicker` registers `view.save`/`view.update`/… which from inside a drawer would collide with the ids the module _behind_ the drawer registers, and would read as acting on that module's view rather than on a field list. Show Fields already does this job. |
| 3   | `?mode=` is cleared by every view switch, not only Notes'                                         | A mode override belongs to the view it was set on. Left in the URL it would pin Notes to Flat through every view picked afterwards, with nothing on screen explaining why — so `setView` clears it generally rather than Notes patching around it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 4   | **`viewScopes` added: saving a view now forks the module's own per-view scopes** (`useCopyScope`) | The design assumed view-id-keyed scopes were the whole answer. They are not: they give each view _its own_ settings, but a **new** view's scope starts empty, so Save dropped exactly the settings this spec exists to carry. Found by driving the app — setting Notes to Flat and saving gave a view that opened on Nested. Deleting a view now clears these scopes too, for the same reason `useSavedViews.remove` clears the grid scope.                                                                                                                                                                                                                                                                                                                 |
| 5   | `ChooserSettingsDialog` takes `viewName`                                                          | It titled itself from `view.label`, which is now the **base**, so on a saved view it read "Best Overall Settings" directly under a picker saying "Deadline heavy" — while the line beneath claimed "these settings apply to this view only". The heading has to name the view whose settings they are; the base still supplies the blurb and the defaults.                                                                                                                                                                                                                                                                                                                                                                                                  |

## Task 1: Save spec documentation

This folder: `plan.md` (active), `shape.md`, `standards.md`, `references.md`.

## Task 2: Grow `SavedView`, keep the module pure

`lib/settings/views.ts` — add `base: string | null` and `switches: Record<string, boolean>`;
parse both defensively; add `updateSavedView(saved, id, snapshot)` beside `renameSavedView` /
`removeSavedView`. Extend `views.test.ts`.

## Task 3: `useModuleViews` — one hook instead of four steps per grid

New `components/grid/useModuleViews.ts` owning the `useSavedViews` → allow-list →
`useTabView` → `useGridState(`${module}.${view}`, …)` sequence, whose order is load-bearing
(the previous spec records getting it backwards). `GridDefaults` gains `switches`, merged under
stored switches in `useGridState`.

## Task 4: Complete the CRUD

`ViewPicker` gains Update and Rename, and registers all four as commands so `⋯` and `⌘K` reach
them. `GridToolbar` takes a `views` prop and renders the select itself, so a grid opts in by
passing the hook's return value rather than hand-placing the control in `left`.

## Task 5: Outline and Wishes

Each declares a default view plus its switch set and passes `views` to `GridToolbar`.

## Task 6: Notes

`mode` / `sort` / `filter` move from `NOTES_FILTER_SCOPE` to `notes:{viewId}`. `?view=` becomes
the view id; the mode gets `?mode=`.

## Task 7: Chooser

`chooserView`, `parseChooserSettings` and `buildChooserItems` are fed `base` instead of the raw
view id; weights then follow the saved id through `chooserScope` with no new storage.

## Task 8: Metrics tracking grid — **not built**

Dropped on inspection; see change 2 in **Changes from original plan**. Its four columns, two of
them unhideable, leave a view with two booleans to carry.

## Task 9: Rename the nav layer to Modules

`shell/views.ts` → `modules.ts` and the six consumers, plus user-facing copy that calls a
destination a view.

## Task 10: Tests

Unit only, per `development/testing.md`. The catalogue rules and base/switch resolution are
pure and tested; the hooks are wiring. No DB surface changes, so no new integration test.

## Task 11: Verify, freeze, update docs

Checks and a real drive-through, then amend `standards/components/data-grid.md` — its **Saved
views** section still says a view captures exactly three settings and that capturing more is
"deliberately not done" — mark this spec frozen, and update `product/roadmap.md`.

## Follow-ups (new work — not amendments to this frozen spec)

- **Unify the settings UI.** The stated end state is that a module's own settings stop looking
  distinct from grid settings — the Chooser's weights dialog is just this grid's settings. This
  spec only made a view _carry_ them. Explicitly deferred by the user.
- **Capturing sort and density**, if a saved view ever demonstrably needs them. Needs the
  nullable treatment `filters` has, plus a `SETTINGS_VERSION` bump.
- **The Metrics tracking grid**, if it ever grows past four columns and gains real filters.
- **The Day grid**, only if it survives.
