# Standards that applied

**Status: frozen / complete** (2026-08-04)

## `components/data-grid.md`

- **"Hierarchy survives every operation… never who a row's parent is."** The rule this work
  enforces. It was already written and already being violated by the filter pipeline, which
  is why the fix is grid-wide rather than a special case for the Icon column.
- **"Filtering, searching and grouping act on _defined_ columns, not visible ones."** Why a
  type filter keeps working after you hide the `type` column, and why hiding a column is a
  layout choice rather than an un-asking of the question.
- **"If you find yourself adding a control to one grid, add it to `GridToolbar` instead."**
  Read in reverse here: a control on every grid that is really a column filter belongs on the
  column, not the toolbar.

**Amended by this spec:**

- The ancestor rule and its counting convention, under the hierarchy heading.
- **"Never filter a tree by dropping a node's subtree with it"** — the inverse mistake, with
  the one place it is still correct (`showCompleted`) called out so the exception does not
  read as an inconsistency.
- A new **"One type glyph per row, and the column set decides where it goes"** section,
  including the rule that a grid-wide fact belongs in a context rather than in `ColumnDef`.
- Two toolbar-restraint tests: _is it a column filter wearing a checkbox?_ and _are its only
  two states "unavailable" and "duplicated"?_
- `lib/grid/ancestors.ts` added to the pure-module table.

## `components/ux-principles.md`

- **"Progressive disclosure — show only what's needed now."** Four permanent checkboxes for a
  filter the Projects / Tasks / Goals tabs already answer is the opposite. The control did not
  earn its width.
- **"Clarity over cleverness."** Two identical glyphs on one row is the interface
  contradicting itself, and a `Density:` label explaining a dropdown whose two options fit in
  eleven characters is a label doing a control's job.
- **"Consistency — the same patterns across every view."** Type and Focus filtering now go
  through the same column-filter machinery as everything else: same chips, same `Clear all`,
  same column menu, one definition of what filtering a tree means.
- **Accessibility exemption** still applies; the segmented density control keeps
  `role="group"` and `aria-pressed` because they are how it reports its state, not for
  compliance.

## `development/testing.md`

- **"Put real logic in `src/lib/**`, with a `foo.test.ts` beside it."** → `lib/grid/ancestors.ts`,
  nine tests.
- **"A test earns its place if it would fail on a plausible mistake."** The mistakes tested
  for: pulling in siblings instead of ancestors, crossing into a neighbouring subtree, popping
  the ancestor stack by count rather than by depth, and charging a flat grid for a tree
  operation. Plus the settings parser keeping a retired `types: { task: false }` from
  resurrecting as a hidden type with no control left to undo it.
- **"Do not write React component tests."** The glyph swap, the toolbar and the filtered tree
  were verified by driving the real app and reading the row labels back.
- No database code changed, so no `*.integration.test.ts` was in play.

## `frontend-design` (skill)

Consulted as asked. Most of it addresses greenfield pages with a free hand on palette and
type, which this is not — the grid has a settled visual language and the job was subtraction.
The parts that carried over: _"before leaving the house, remove one accessory"_ (three
controls removed, one demoted from a labelled select to a segmented pair), and **words as
design material** — `Roomy` / `Dense` name what you get rather than the setting's category,
and `Type icon` / `Type name` name the two columns by what they show.
