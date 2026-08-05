# Standards that applied

**Status: frozen / complete** (2026-08-05)

## `components/data-grid.md`

- **"What we deliberately do not do → User-saved named views… revisit when the presets
  demonstrably do not [cover it]."** Checked rather than ignored, found to be met, and the row
  removed as part of this change. A standard that says "not yet" has to be re-read when the
  ground moves, or it turns into a prohibition nobody remembers the reason for.
- **"A view is a collection of settings, never a mode"** (added last cycle) is what made this
  small. The feature is the naming, not the behaviour.
- **"A tab declares what it has — it does not assemble buttons."** `ViewPicker` is shared;
  a tab passes its built-in list and gets saving, deleting and the grouped picker.
- **"One hook owns the whole `grid:{tabId}` scope."** Respected: the catalogue is a _separate_
  scope (`views:{tab}`), so saving a view never writes through the grid's `patch`.

**Amended by this spec:** the "do not do" row deleted; a **Saved views** subsection added
covering catalogue-versus-state, what is captured and why, random ids, and the allow-list;
`lib/settings/views.ts` in the pure-module table.

## `components/ux-principles.md`

- **"Avoid modals for routine editing… reserve them for fast capture."** The naming dialog is
  the capture case exactly: it owns no record, it is over in one keystroke, and the thing it
  names is the grid behind it.
- **"Error prevention > error recovery."** `Delete view` appears only while a saved view is
  selected, so the destructive control is _absent_ on a built-in rather than present and
  ignored. Deleting falls back to a real view instead of an empty selection.
- **"Immediate, clear feedback."** Saving switches to the new view, so the picker shows what
  just happened rather than leaving you on an identical-looking grid.

## `development/testing.md`

- **"Put real logic in `src/lib/**`."** The catalogue rules — parsing, id validity, unique
  names, the cap — are pure and tested; the hook is wiring.
- **"A test earns its place if it would fail on a plausible mistake."** Tested: an id
  containing `.` (which would make `parseScope` ambiguous about where the tab ends), two
  entries sharing an id (which would make one grid scope serve two picker rows), renaming a
  view to its own name (which naive de-duplication turns into "One (2)"), and evicting at the
  cap instead of refusing. `isValidViewId` is checked against the **real** `isValidScope`, so
  the two cannot drift.
- **"Do not write React component tests."** The picker, the dialog and the full save →
  switch → reload → reset → delete lifecycle were verified by driving the app.
- No database code changed; settings are rows the app already owns, written through the
  existing provider.
