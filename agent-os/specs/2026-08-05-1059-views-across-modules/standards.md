# Standards that apply

**Status: frozen / complete** (2026-08-05)

## `components/data-grid.md`

The governing standard, and the one this spec amends.

- **"A view is a collection of settings, never a mode."** The test it gives — _if picking the
  view is the only way to get some behaviour, it is a mode_ — is what licenses capturing
  switches. Every switch stays on the toolbar and combinable; the view records where it was.
- **"Next actions is a switch, not a view."** Read carefully, because this spec looks like it
  contradicts it and does not. The rule forbids a view that **owns** behaviour available
  nowhere else. A view that remembers a switch position is the opposite: the setting remains
  reachable one at a time, which is the standard's own definition of a legitimate view.
- **"`GridSettings.filters` is nullable, and the three states are distinct."** The precedent
  that decides the switches question — and, on inspection, decides it _differently_. `Clear
all` is a whole-map operation, so filters needed null; a switch is independently keyed, so
  per-key fallback covers every state and no version bump is owed.
- **"One hook owns the whole scope."** Preserved: the catalogue stays in `views:{tab}`, and
  `useModuleViews` composes `useGridState` rather than writing through it. Notes' mode/sort/
  filter move into a `notes:{viewId}` scope of their own, not into the grid blob.
- **"A view's defaults are `GridDefaults`."** `switches` joins `order` / `filters` / `groupBy`
  there, so a view's switch positions arrive by the same route as its filters.
- **"Tab-wide settings keep the tab scope; per-view settings keep the view scope."** Why
  `includeDeferred` stays out of a view, and why Notes' mode has to move _in_.
- **"A tab declares what it has — it does not assemble buttons."** The reason `ViewPicker`
  moves inside `GridToolbar` behind a `views` prop instead of being hand-placed in `left` by
  each grid. The standard's own line — _"If you find yourself adding a control to one grid, add
  it to `GridToolbar` instead"_ — describes exactly what the last cycle did five times.
- **The overflow tier's three-tier table.** Decided Task 4 against the first shape: Save /
  Update / Rename / Delete are "a real command, used occasionally", so they register and appear
  behind `⋯`, beside `Show Fields` and `Reset this grid`. Only the select holds bar width.
- **"Parsing never throws and never strands a tab."** `base` and `switches` parse defensively;
  a `base` naming a built-in that no longer exists reads as the module's default.

**Amended by this spec.** The **Saved views** subsection said a view captures order, filters and
grouping, and that capturing more "needs a second migration and is deliberately not done". Both
halves changed: switches joined, and no migration was needed. It now also records
`useModuleViews` and its load-bearing hook order, `base`, the view-id-keyed module scopes and
`viewScopes` forking on save, `defaultViewSharesModuleScope`, the switch-recording-is-not-a-mode
distinction, and the toolbar/overflow placement. The **Toolbar** intro gained `views` alongside
`left`/`right`, and the `GridDefaults` bullet under **Persistence** now names switches.

## `components/ux-principles.md`

- **"Avoid modals for routine editing… reserve them for fast capture."** The naming dialog
  already passes on the previous spec's reasoning; Rename reuses it rather than inventing an
  inline edit in a `<select>`.
- **"Error prevention > error recovery."** Update, Rename and Delete are unavailable on a
  built-in view rather than present and ignored — a built-in is not the user's to change.
  Deleting falls back to a real view.
- **"Immediate, clear feedback."** Update has the failure mode Save does not: it changes
  nothing you can see, because the grid already looks like what you just stored. It needs to
  say it happened.
- **"Getting between views, and finding commands."** The `⋯` / `⌘K` surfaces the view commands
  register into.

## `development/testing.md`

- **"Pure logic in `src/lib/**` — always."** `updateSavedView`, the parse rules for `base` and
  `switches`, and base-chain resolution are pure and tested in `lib/settings/views.test.ts`.
- **"React components — no."** So `useModuleViews` and `ViewPicker` get no tests; anything in
  them worth testing is extracted to `lib/settings/views.ts` first. The switch-merge precedence
  is the case to watch — it is real logic and belongs in the pure module, not in the hook.
- **"A test earns its place if it would fail on a plausible mistake."** The plausible mistakes
  here: merging switches the wrong way round (a view's `true` beating a user's explicit
  `false`), a `base` chain that nests instead of following through, and `updateSavedView`
  overwriting the name along with the settings.
- **"Database mutations — always, as `*.integration.test.ts`."** Not triggered: no
  `mutations.ts` or `queries.ts` surface changes, only new payload shapes inside the existing
  `user_settings` scope rows.
