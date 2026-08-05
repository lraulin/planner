# Saved Views

**Status: frozen / complete** (2026-08-05)
Spec folder: `agent-os/specs/2026-08-05-0230-saved-views/`

Delta-spec over the frozen
[`2026-08-05-0100-views-as-settings`](../2026-08-05-0100-views-as-settings/), which made a
view nothing but stored settings and named this as the small step that followed.

## Context

Two follow-ups from the last cycle, done together because the first is a prerequisite:

1. **Views declaring their column order**, folding `viewOrder` / `defaultOrder` into the same
   object as filters and grouping.
2. **Saving the current grid as a named view.**

`data-grid.md` listed user-saved views under _what we deliberately do not do_, with the
condition **"revisit when the presets demonstrably do not cover it"**. Three cycles of
reshaping views met that condition, and once a view is only a column order, some filters and a
grouping, saving one stops being a feature — it is copying three values and naming them.

## Decisions

| Decision              | Choice                                                                                                                                                                                                    |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GridDefaults.order`  | Column order moves into the defaults object, so one value **is** the view. `useGridState(tabId, columns, defaults)` — the positional `defaultOrder` is gone from all nine call sites.                     |
| Catalogue vs state    | `views:{tabId}` holds what a view _is_; `grid:{tab}.{id}` holds how you have since adjusted it — identical to a built-in view. `Reset this grid` therefore returns to what you saved.                     |
| What is captured      | Order, filters, grouping. Exactly the three with a "not chosen" state. Sort and density have none, so a view default could never beat a stored one — capturing them needs another migration.              |
| Ids                   | Random (`saved-{8}`), never sequential: a reissued id would inherit the deleted view's leftover grid scope. Generated at the call site so `lib/settings/views.ts` stays pure and its tests deterministic. |
| Delete                | Removes the catalogue entry **and** clears its grid scope, via a new `useResetScope()`. An orphan row nothing can reach is a leak with a long fuse.                                                       |
| Names                 | De-duplicated on the way in (`Mine`, `Mine (2)`), because a picker showing one word twice for two different things is worse than a slightly odd name.                                                     |
| Allow-list            | Saved ids join the built-ins in `useTabView`, so deleting the view you are on falls back rather than stranding the tab.                                                                                   |
| Where it lives        | `ViewPicker` in `components/grid/`, used identically by Tasks, Projects and Goals — a tab declares its built-in views and gets the rest.                                                                  |
| No "update this view" | Adjustments already persist to the saved view's own scope, which is what a built-in view does. A separate "save changes" would be a fourth thing that could disagree with the other three.                |

## In scope (as built)

- `lib/settings/views.ts` + 17 tests: parse/serialize, add/remove/rename, unique names, id
  validity checked against the real `parseScope`.
- `views` scope kind, `viewsScope(tabId)`, and its label on the settings reset page.
- `useSavedViews` (catalogue + commands), `snapshotOf`, `savedViewDefaults`.
- `ViewPicker` with grouped `Built in` / `Saved` options, `Save view…` and `Delete view`, and
  a one-field naming dialog.
- `useResetScope()` on the settings provider.
- `GridDefaults.order`; nine `useGridState` call sites updated.
- Tasks, Projects and Goals wired identically.

## Out of scope (as built)

- **Sort and density in a saved view.** See the decision above; it is a second migration for a
  fraction of the value, and the built-in views do not vary sort either.
- **Renaming from the UI.** `renameSavedView` exists and is tested; it has no control yet
  because Save-then-Delete covers it and a rename dialog is a third modal on one bar.
- **Saved views on the Task Chooser.** Its views carry scoring weights and states — a
  different shape, and already an editable collection of its own.
- **Sharing or exporting views.** Single-user app.

## Changes from original plan

| Change                                                   | Why                                                                                                                                                                                        |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `DEFAULT_ORDER` had to move above `VIEWS` in `TasksGrid` | The view objects reference it at module scope, so the original placement was a temporal-dead-zone crash at import — caught by reading the file after the edit, not by the type checker.    |
| `useSavedViews` had to be hoisted above `useTabView`     | The allow-list needs the saved ids, so the catalogue has to load first. Obvious in hindsight; it made the first version silently reject every saved view and fall back to the default one. |
| Added `useResetScope`                                    | `useSetting(...).reset` only reaches its own scope, so deleting a view could not clean up after itself.                                                                                    |

## Acceptance criteria

- [x] `Save view…` captures the grid as it stands, names it, and switches to it.
- [x] The picker groups `Built in` and `Saved`.
- [x] Switching away and back restores the saved view's columns; a reload keeps it.
- [x] Adjusting a saved view persists to that view; `Reset this grid` returns to what was
      saved (verified: hide Effort → reset → Effort back, Deadline still hidden).
- [x] `Delete view` removes it, clears its grid scope, and falls back to the first built-in.
- [x] All three node tabs behave identically.
- [x] A view id is a legal scope key, and a duplicate or malformed entry is dropped rather
      than failing the whole catalogue.
- [x] `npm test` (1625, 16 integration files), `typecheck`, `lint` clean.

## Follow-ups (new work — not amendments to this frozen spec)

- Rename from the picker, if Save-then-Delete proves annoying.
- Sort in a saved view, if the missing piece is ever felt — it needs `sorts` to gain the same
  "never set" distinction `filters` got.
- A per-view `?view=` deep link already works for saved ids, since they travel the same path.
