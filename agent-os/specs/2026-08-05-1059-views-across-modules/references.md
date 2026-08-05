# References

**Status: frozen / complete** (2026-08-05)

## Achieve Planner

`docs/achieve-planner/user-manual.md:2155`, on the Task Chooser's scoring settings:

> You can adjust the settings used to score items in the current view. When you change
> settings, the new settings will only apply to items in the current view. **Other views will
> retain their own unique settings.**

This is the whole argument for capturing module settings in a view, stated by Achieve about the
one module where it matters most. Our `useChooserSettings` already honours it —
`chooser:{viewId}`, with a header comment saying so — which is why the Chooser needed no new
storage design, only the ability to _make_ a view.

Also relevant: `online-help.md:1909`, Advanced Scoring Settings, behind an `Advanced…` button
inside the same per-view dialog. Achieve nests per-view settings two deep and never presents
them as anything but "settings for this view" — the end state noted as out of scope in
`shape.md`.

**Where we still diverge:** Achieve ships fixed views and no way to add one. Saved views were
already a deliberate departure (previous spec); this one extends the departure to every module
rather than widening it in kind.

## Prior specs this builds on

| Spec                                                                                                     | What it decided that this depends on                                                                                                                                                                                     |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`2026-08-05-0230-saved-views`](../2026-08-05-0230-saved-views/)                                         | The catalogue-vs-state split, random ids, the `MAX_SAVED_VIEWS` cap, and the load-bearing hook order (`useSavedViews` **before** `useTabView`, or every saved id is rejected as illegal and the tab silently falls back) |
| [`2026-08-05-0100-views-as-settings`](../2026-08-05-0100-views-as-settings/)                             | A view is nothing but stored settings; the nullable-field contract that `base` and `switches` are measured against                                                                                                       |
| [`2026-08-05-0838-navigation-and-command-surface`](../2026-08-05-0838-navigation-and-command-surface/)   | The module list being renamed here, and the `⋯` / `⌘K` command registry the view commands go into                                                                                                                        |
| [`2026-08-04-2030-type-filter-and-toolbar-cleanup`](../2026-08-04-2030-type-filter-and-toolbar-cleanup/) | Why a toggle that is really a column filter does not survive; the reason to check each switch before making it capturable rather than assuming the set is right                                                          |

## In-repo prior art leaned on

| Concern                          | Where                                                                                                                                              |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Per-view module settings         | `components/chooser/useChooserSettings.ts` + `chooserScope` — the pattern Notes is being moved onto                                                |
| The open switches map            | `lib/settings/grid.ts:96-106`, and its "a tab adding a switch should not have to edit this type" note, which is why no per-module codec is needed  |
| Scope key legality for saved ids | `parseScope`'s `KEY_PATTERN` in `lib/settings/scopes.ts:47` — `saved-a1b2c3d4` passes, which is what makes `chooser:saved-a1b2c3d4` free           |
| Nullable "not chosen" defaults   | `GridSettings.order` / `filters` / `groupBy`, and `GridSettings.view` — the last of which is why a module's default view keeps the bare grid scope |
| Shared toolbar controls          | `rowActions` on `GridToolbar` — "a tab declares that it has a selection, not two buttons". `views` follows the same shape                          |
| Command registration             | `useRegisterCommands` at `GridToolbar.tsx:200`, already used for Rename / Open                                                                     |
| A one-field modal                | `NameViewDialog` in `ViewPicker.tsx`, reused for Rename                                                                                            |

## Files changed

```
src/lib/settings/views.ts               base, switches, SavedViewSettings,
                                        updateSavedView, baseViewId
src/lib/settings/views.test.ts
src/lib/settings/grid.ts                resolveSwitches (the per-key fallback)
src/lib/settings/grid.test.ts
src/lib/settings/scopes.ts              notesViewScope, NOTES_DEFAULT_VIEW_ID
src/lib/settings/scopes.test.ts
src/components/grid/useModuleViews.ts   (new) the four-step sequence once, base
                                        resolution, saveAs/update/rename/delete,
                                        viewScopes forking
src/components/grid/useSavedViews.ts    update(); snapshotOf + savedViewDefaults
src/components/grid/ViewPicker.tsx      rewritten: select + four registered commands
src/components/grid/GridToolbar.tsx     `views` prop; renders the select
src/components/grid/useGridState.ts     GridDefaults.switches, merged under stored
src/components/settings/SettingsProvider.tsx  useCopyScope
src/components/outline/OutlineGrid.tsx  views (bare default scope)
src/components/tabs/WishesGrid.tsx      views (bare default scope)
src/components/notes/NotesGrid.tsx      views; mode/sort/filter → notes:{viewId};
                                        ?view= is the view, ?mode= the mode
src/components/chooser/ChooserGrid.tsx  views; base feeds scoring; viewScopes
src/components/chooser/useChooserSettings.ts  (viewId, base) split
src/components/chooser/ChooserSettingsDialog.tsx  viewName
src/components/tabs/{Tasks,Projects,Goals}Grid.tsx  onto useModuleViews
src/lib/url/viewState.ts + test          ?mode=; setView clears it
src/components/url/useViewStateUrl.ts
src/lib/chooser/views.ts                 CHOOSER_VIEW_IDS removed (the allow-list
                                         is useModuleViews' job now)
src/components/shell/views.ts → modules.ts  + AppShell, Sidebar, MobileNav,
                                              MobileHeader, MoreSheet, globalCommands
src/lib/commands/registry.test.ts        module registry assertions
agent-os/standards/components/data-grid.md
agent-os/product/roadmap.md
```

**Not changed:** `src/components/metrics/MetricDrawer.tsx` — dropped from scope, see change 2
in `plan.md`.
