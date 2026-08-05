# Views as Collections of Settings

**Status: frozen / complete** (2026-08-05)
Spec folder: `agent-os/specs/2026-08-05-0100-views-as-settings/`

Delta-spec over the frozen
[`2026-08-04-2330-next-actions-and-tab-review`](../2026-08-04-2330-next-actions-and-tab-review/),
which flagged this as the one remaining piece of magic and named the mechanism it needed.

## Context

Two features had been deferred twice for the same missing distinction:

1. The Outline could not open with finished work hidden, because a default filter you cannot
   clear is worse than none.
2. `View` pickers hid their row filters in `sliceTree`'s `keep` — `Active Task Status` and
   `Active Task Schedule` had **identical** predicates and differed only by stored column
   layout, while `Completed` and `All` were State filters written as code.

Both needed `GridSettings.filters` to tell **"never set"** from **"explicitly cleared"**. One
mechanism, so it was worth doing once rather than half of it twice.

## Decisions

| Decision                          | Choice                                                                                                                                                                                         |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nullable filters                  | `Record<string, ColumnFilter> \| null`. Null follows the view's defaults, `{}` is "show everything" and survives a reload, a map is the user's choice. Same contract as `order` and `groupBy`. |
| v1 migration                      | An **empty** map from a `v: 1` blob reads as null: v1 serialized `{}` whether or not a funnel had ever been opened, so it is not evidence of a decision. A v1 blob with real filters is kept.  |
| Version bump                      | `SETTINGS_VERSION` 1 → 2, which is exactly what that constant is for. Nothing else reads it; the metrics test that asserted the literal now asserts the constant.                              |
| Defaults shape                    | `useGridState(tabId, columns, order, defaults)` where `defaults: GridDefaults = { groupBy?, filters? }` — an options object rather than a fifth positional parameter.                          |
| Filters as the funnel writes them | `stateFilters.ts` builds **ticked-id set filters**, the same shape unticking two boxes produces, so the funnel opens with those boxes already unticked instead of claiming all is shown.       |
| Encoding per column               | The narrow State column filters on Achieve's codes and the wide one on labels, because each filters on what its own cell shows. A view names its column and its encoding.                      |
| `keep` becomes structural         | "This tab shows tasks" stays in `keep`; which _states_ a view shows is its default filter.                                                                                                     |
| Clear vs Reset                    | `Clear all` clears to nothing; `Reset this grid` restores the view's defaults. Two questions, two controls.                                                                                    |

## In scope (as built)

- `GridSettings.filters` nullable, with the v1 migration and 5 new parser tests.
- `hasAnyNarrowing(filters, advancedFilter, search)` — takes resolved filters rather than
  reaching into settings.
- `GridDefaults` + effective-filter resolution in `useGridState`; `setFilter` materialises the
  view's other defaults alongside the change.
- `lib/grid/stateFilters.ts` + 8 tests.
- Tasks, Projects and Goals views declare `filters`; their `keep` predicates are structural.
- The Outline opens with `State: all but Completed, Cancelled`.
- Chip bar: describe a mostly-ticked filter **by exclusion**, and draw **no chip** for one
  that excludes nothing.

## Out of scope (as built)

- **Views declaring column order.** Each view already stores its own layout under
  `grid:{tab}.{view}`, which is what makes `active-status` and `active-schedule` different;
  moving the preset into the view object would duplicate `viewOrder`, not replace it.
- **A view picker on the Outline.** It has one arrangement; a picker with one entry is chrome.
- **Migrating the Chooser's view `defaults`** to `GridDefaults`. Its settings are a different
  shape (weights, scoring, states) and already a real, editable collection.

## Changes from original plan

| Change                                                           | Why                                                                                                                                                                                                                                  |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Chips gained a `domainOf` and two new rules                      | Ticked-id storage meant the Outline's default rendered as `State: 7 selected` — a chip that names a column and withholds the one thing you wanted. Then Goals showed `Status: 7 selected · Showing 22 of 22`, a chip hiding nothing. |
| `SETTINGS_VERSION` bumped rather than a grid-local version added | It is shared by five payloads but read by none; a second version constant would have been two things to keep straight for no benefit.                                                                                                |

## Acceptance criteria

- [x] The Outline opens `Showing 67 of 111 · State: all but Completed, Cancelled`.
- [x] `Clear all` → 111 rows, **and it survives a reload** — the distinction the whole
      mechanism exists for.
- [x] `Reset this grid` → the default filter returns.
- [x] Tasks views: Active 5 rows (`all but Completed`), Completed 33 (`Completed, Cancelled`),
      All 38 with no chip. 33 + 5 = 38.
- [x] Projects opens on `all but Completed, Cancelled`; Goals draws no chip because no goal is
      settled, and would draw one the moment a goal were.
- [x] A v1 blob with real filters keeps them; an empty v1 map follows the defaults.
- [x] `npm test` (1608, 16 integration files), `typecheck`, `lint` clean.

## Follow-ups (new work — not amendments to this frozen spec)

- Views could declare their column order too, folding `viewOrder` into the same object.
- A "Save current settings as a view" affordance is now a small step: a view is already
  nothing but the values a grid stores.
