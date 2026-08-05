# Shaping — Views Across All Modules

**Status: frozen / complete** (2026-08-05)

## The feature was already built; it just was not the app's

The previous cycle shipped saved views and wired three grids. What made this cycle worth doing
is that "wire up the other five" turned out to be the smaller half. The larger half is that a
view was capturing the wrong things on the modules that needed it most.

Ask what distinguishes two ways of working in the Task Chooser. It is not the column order — it
is the weights. Achieve knew this: its Chooser view dropdown sits next to a **Change Settings**
button, and the dialog behind it is weights. Our `useChooserSettings` already stores them per
view and its header comment already says why. So the Chooser had the interesting half of saved
views since before saved views existed, and could not save one.

## The extras problem dissolved instead of being solved

The obvious design is `SavedView.extras: unknown` with a codec per module. Three facts killed it:

- Grid **switches** are already an open `Record<string, boolean>` in `GridSettings`, and they
  already hold every toggle named as missing: Outline's `levelAreas` / `levelGoals`, Tasks'
  `nextActions` / `showPurpose`, Projects' `includeGoals`, Chooser's `advancedFilters`. Nothing
  to design — a view records the map.
- Chooser weights live at `chooser:{viewId}`, and `saved-a1b2c3d4` satisfies `parseScope`'s
  `KEY_PATTERN`. So a saved Chooser view gets its own weights **for free**, with no new field,
  no codec and no migration. The scope key was doing the work all along.
- Notes is the only genuine move, and it moves _toward_ the shape Chooser already has:
  singleton `notes:filter` → `notes:{viewId}`.

So the general rule is **a module's own settings hang off the view id**, and the only new field
is the one that cannot be derived: which built-in a saved view came from.

## `base` exists because Chooser derives behaviour, not just defaults

`chooserView(viewId)`, `parseChooserSettings(raw, viewId)` and `buildChooserItems({viewId})` all
take a `ChooserViewId` and read real behaviour off it — `tcPriority`, the next-action rule, the
weight defaults. A saved id is not one of the five, so a saved Chooser view has to say what it
derives from.

It pays for itself elsewhere. `viewDefaults(savedId)` in `TasksGrid` currently falls through to
`{ order: DEFAULT_ORDER }`, so a view saved from **Completed** inherits nothing of Completed.
Nobody has noticed because a saved view stores its own filters, but it is why a view saved
before a column existed opens without that column's default filter.

`base` always names a built-in: saving from a saved view follows the chain rather than nesting.
A two-level chain would make deleting the parent silently re-base the child.

## No version bump, and why that is not a shortcut

`filters` needed nullability because `Clear all` acts on the whole map: `{}` had to be
distinguishable from "never touched". Switches have no such operation — each one is its own key,
so the resolution is a per-key fallback:

```
grid.switches[id]  ??  view.switches[id]  ??  entry.defaultOn  ??  false
```

Merging the view's map underneath the stored one inside `useGridState` means `switchValue()` and
the toolbar's toggle render do not change at all, and a user who turns a switch off against a
view that has it on writes a concrete `false` that wins. `Reset this grid` clears the grid scope
and the view's positions come back. Every state is representable; there is nothing for a
version to disambiguate.

## Where the plan was wrong once

The first shape gave `ViewPicker` a `View ▾` menu holding Save / Update / Rename / Delete,
reasoning that four buttons is too many for the bar. `data-grid.md` already answers this with a
three-tier table — bar, `⋯`, deleted — and "a real command, used occasionally" is the middle
row, where `Show Fields` and `Reset this grid` already sit. The menu would have been a fourth
tier invented to avoid reading the table. The select stays on the bar; the four commands
register and appear in `⋯` and `⌘K`.

## Where the "it dissolves" story was too clean

Keying a module's settings by view id gives each view its own — that part held. What it does
**not** do is get them into a view you save: a new id means a new, empty scope, so Save handed
you a view that opened on the module's defaults instead of on the grid you had just named. On
Notes that showed up immediately (set Flat, save, get Nested); on the Chooser it would have been
quieter and worse, since a view saved from customised weights would silently score differently.

So `viewScopes` exists: a module lists the scopes it keeps per view, and `saveAs` forks each one
through `useCopyScope`. Deleting clears them, for the same reason `remove` clears the grid scope.
The dissolution was still most of the win — no `extras` field, no per-module codec, no migration
— but "the scope key was doing the work all along" was half a sentence too confident.

Neither this nor the `ChooserSettingsDialog` title (which named the base while the picker named
the saved view) was catchable by the type checker or the unit tests. Both came from driving the
app, which is the second cycle running where that is where the real bugs were.

## The claim most likely to be wrong

That no stored layout is orphaned. Outline, Wishes, Notes and the tracking grid write
`grid:outline`-style bare scopes today; giving them views could quietly move them to
`grid:outline.{view}` and reset everyone's columns. The defence is that
`GridSettings.view` is _already_ nullable with null meaning "the module's default", so the
default view's scope is the bare one by definition rather than by special case. This is worth
checking against a real reload rather than trusting, which is what the acceptance criteria say.

## Out of scope

- **Unifying the settings UI.** The stated end state is that module-specific settings stop
  looking distinct from grid settings — Chooser's weights dialog is just this grid's settings.
  This spec only makes a view _carry_ them; the presentation stays as it is.
- **Capturing sort or density.** Unchanged from the previous spec's reasoning: no
  "not chosen" state, so a view default could never win.
- **`includeDeferred`.** Deliberately tab-wide in `data-grid.md`.
- **The Day grid.** Excluded: Tasks + Chooser cover it and it may be removed.
- **The Metrics tracking grid.** Was in scope and was dropped once its column list was read —
  four columns, two unhideable, so a view there varies two booleans. See change 2 in `plan.md`.
- **Renaming `tabId`, `components/tabs/`, or any storage key.**

## Context

- **Visuals:** None. Achieve's Chooser view dropdown + Change Settings pairing is described in
  `docs/achieve-planner/` and was the reference for the weights-belong-to-the-view decision.
- **References:** see `references.md`.
- **Product alignment:** `roadmap.md` already anticipates this — the Chooser entry records
  weights being "tunable per view", and the navigation entry lists the future modules that
  make a per-module view story worth standardising.
