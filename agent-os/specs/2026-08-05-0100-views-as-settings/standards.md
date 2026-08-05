# Standards that applied

**Status: frozen / complete** (2026-08-05)

## `components/data-grid.md`

- **"Parsing never throws and never strands a tab… an explicitly empty collection is honoured
  — 'show me nothing' is a legal choice."** This is the clause the whole change serves: it was
  already true of `order` and `groupBy` and quietly false of `filters`.
- **"Filter state is always visible and always clearable."** A default filter that did not
  draw a chip, or drew one nobody could act on, would break it — which is why the chip rules
  changed alongside the mechanism rather than after it.
- **"Every user-visible grid preference goes into the `grid:{tabId}` scope through the single
  `patch`."** View defaults are not an exception: they are what that scope holds _before_ the
  user writes to it.

**Amended by this spec:** a **view is a collection of settings, never a mode** section with
the mode test and the null/`{}`/map table; a **chip bar accounts for missing rows, not stored
state** subsection; `GridDefaults` added to the persistence rules; `lib/grid/stateFilters.ts`
in the pure-module table.

## `components/ux-principles.md`

- **"Clarity over cleverness — if users have to guess how to do something, the design has
  already failed."** A view whose behaviour is unavailable any other way can only be learned
  by trying every view.
- **"Forgiveness & safety — let users recover easily."** `Clear all` and `Reset this grid` now
  answer two different questions, so there is a way back from either direction.
- **Accessibility exemption** unaffected; no new interactive surface.

## `development/testing.md`

- **"Put real logic in `src/lib/**`, and write a `foo.test.ts` beside it."** →
  `lib/grid/stateFilters.ts`, and the parser and chip rules gained tests in place.
- **"A test earns its place if it would fail on a plausible mistake."** The mistakes tested
  for: reading an empty v1 map as a deliberate clear (which would hide the default from
  everyone already using the app), degrading a corrupt blob to `{}` rather than to the
  defaults, encoding a filter as codes for a column that stores labels (which would empty the
  grid while the chip claimed to hide two states), and a default filter reading as inactive
  and so not drawing a chip.
- **"`npm run test:unit` passing does not mean the database tests ran."** Checked: the full
  run reports 16 integration files, 1608 tests.

## `product/date-model.md`, `database/migrations.md`

Neither applied: no schema change and no dates. The migration here is a **read-time** one in
`parseGridSettings`, which is where this app has always put settings-shape changes — stored
blobs are user preferences, not records, and rewriting them on read would mean a write on
every page load.
