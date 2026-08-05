# References

**Status: frozen / complete** (2026-08-05)

## The decision this retires

`agent-os/standards/components/data-grid.md`, "What we deliberately do not do":

> **User-saved named views** — Built-in presets plus persisted switches cover it so far.
> Revisit when the presets demonstrably do not.

Removed by this spec, and replaced with a **Saved views** section under "a view is a collection
of settings". The condition was met; the row would otherwise read as a prohibition long after
the reason for it had gone.

## Achieve Planner

Achieve ships fixed views and no way to make one — its Outline, Projects and Tasks grids each
have a list you cannot add to. This is a deliberate departure, and a small one: our views were
already user-editable collections of settings, so the only thing missing was a name.

## In-repo prior art leaned on

| Concern                  | Where                                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------------------------ |
| Per-view scopes          | `grid:{tab}.{view}` and `useTabView` — a saved view is just another key                                |
| "Not chosen" vs "chosen" | The nullable `order` / `filters` / `groupBy` in `lib/settings/grid.ts`, which decided the cut          |
| Parse-never-throws       | `parseSavedViews` follows `parseGridSettings`: drop the bad entry, keep the list                       |
| Scope key validation     | `parseScope`'s `KEY_PATTERN`, which `isValidViewId` is tested against directly                         |
| A one-field modal        | `QuickCaptureDialog`'s reasoning — owns no record, over in a keystroke                                 |
| Shared toolbar controls  | `rowActions` from two cycles ago; `ViewPicker` follows the same "tab declares, toolbar supplies" shape |

## Files changed

```
src/lib/settings/views.ts              (new) the saved-view catalogue
src/lib/settings/views.test.ts         (new)
src/components/grid/useSavedViews.ts   (new) catalogue + save/remove/rename, snapshotOf
src/components/grid/ViewPicker.tsx     (new) grouped picker, Save view…, Delete view
src/lib/settings/scopes.ts             `views` kind, viewsScope, label
src/components/settings/SettingsProvider.tsx  useResetScope
src/components/grid/useGridState.ts    GridDefaults.order; useTabView allow-list note
src/components/tabs/TasksGrid.tsx      saved views; DEFAULT_ORDER hoisted above VIEWS
src/components/tabs/ProjectsGrid.tsx   saved views
src/components/tabs/GoalsGrid.tsx      saved views
+ six other useGridState call sites moved to the defaults object
agent-os/standards/components/data-grid.md
```
