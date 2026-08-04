# Type as a Column, and a Toolbar That Earns Its Width

**Status: frozen / complete** (2026-08-04)
Spec folder: `agent-os/specs/2026-08-04-2030-type-filter-and-toolbar-cleanup/`

Delta-spec over the frozen
[`2026-08-04-1900-column-menus-and-header-drag`](../2026-08-04-1900-column-menus-and-header-drag/),
which put every column control in one menu and made this cleanup possible.

## Context

Three things came together once the column menu existed:

1. The Outline carried **four permanent type checkboxes** (Result Areas / Goals / Projects /
   Tasks) plus Focus only, Show completed and By category — about 340px of toolbar before
   the search box started. The `icon` column added by the field-parity work already
   filters on type, so the checkboxes were a second implementation of a column filter.
2. **Filtering broke the hierarchy.** `DataGrid` dropped every non-matching row, so a
   matching task rendered indented three levels under nothing. Noticed on the Icon column;
   it was true of every column, the advanced filter and the search box.
3. Adding the Icon column **drew the type glyph twice** — once in its own column and once in
   the Name cell, where this app deliberately puts it and Achieve does not.

## Decisions

| Decision                | Choice                                                                                                                                                                                                                                                   |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ancestors survive       | A row that passes narrowing pulls its whole parent chain in (`lib/grid/ancestors.ts`). Achieve's rule, and the only self-consistent one: the alternative leaves a row claiming a parent that is not on screen.                                           |
| Scope of that fix       | Every grid, every narrowing control — column funnels, advanced filter, search. Ancestry is read from **row order and depth**, so flat grids (Notes, Day) get their set back unchanged and pay nothing.                                                   |
| Counting                | Ancestors count as shown. `Showing N of M` is the number of rows you can count on screen; a number that disagreed with the visible list would be worse than one that overstates the match.                                                               |
| Two type columns        | `icon` (glyph, 3rem) **and** `type` (the word, 5.5rem), on the user's call — the type filter is a rare, nice-to-have, so it must not cost the icon beside the name.                                                                                      |
| No duplicate glyph      | Showing `icon` moves the glyph out of the Name cell (`NameIconContext`); hiding it hands it back. `icon` becomes a **placement choice** rather than a duplicate, and Achieve's layout is one tick box away.                                              |
| Where that fact lives   | A React context from `DataGrid`, not a `ColumnDef` prop. The Name cell has no business knowing which other columns are on screen, and threading it through would make eight tabs care about a question only the grid can answer.                         |
| Field names             | `Type icon` / `Type name` in Show Fields and the filter builder. Two columns rendering one value need the list to say which is which; the headers stay `Icon` and `Type`.                                                                                |
| Type sorts by hierarchy | `Result Area → Goal → Dream → Project → Task`, not alphabetically. A Task filed above a Result Area is backwards for a column whose subject is the levels of the tree.                                                                                   |
| Retired from toolbar    | The four type checkboxes, `Focus only`, and `Clear filters`. See below.                                                                                                                                                                                  |
| `showCompleted` stays   | Kept as a toggle **and** kept subtree-dropping: settling a project genuinely settles the work beneath it, so its completed children are not results being hidden by accident. It also reshapes the tree before the grid sees a row, so it has no column. |

### Why each retired control went

- **Type checkboxes** — a column filter wearing four checkboxes, and the per-type views are
  what the Projects / Tasks / Goals tabs already are. As checkboxes they also cascaded:
  unticking "Result Areas" dropped every subtree and emptied the grid.
- **Focus only** — same, and it was **wrong**: it dropped a node's subtree with it, so a
  focused task under an unfocused project disappeared from "Focus only". The `focus` column
  filter keeps ancestors, so it shows focused work in context.
- **Clear filters** — disabled in exactly the state where the chip bar is absent, so it could
  only ever be pressed while the chip bar was on screen offering `Clear all`. A control whose
  only two states are "unavailable" and "duplicated" is one control too many.
- **Density select → segmented control** — a binary choice with both options visible is a
  segmented control, not a labelled dropdown. `Roomy` / `Dense` shows its own state, so the
  word "Density" is not needed to explain it.

Outline toolbar: **13 controls → 7**, ending around x=850 instead of x=1430.

## In scope (as built)

- `src/lib/grid/ancestors.ts` + tests — `withAncestors`, applied in `DataGrid`'s `passIds`.
- `typeColumn()` in `commonColumns`, offered on the Outline, Projects and Goals.
- `iconColumn()` gains `filterLabel` (its checklist used to read `result_area`), a
  hierarchy-order `sortValue`, and the `Type icon` field name.
- `NameIconContext` + `NameCell` honouring it + `DataGrid` providing it.
- `OutlineFilters` loses `types` and `focusOnly`; old blobs still parse and simply ignore
  them. The Outline's `visible` walk is now only about settled rows.
- `GridToolbar`: `Clear filters` removed, `DensityToggle` replaces the density select.
- `data-grid.md`: ancestor rule + the never-drop-a-subtree rule under the hierarchy heading,
  a new "One type glyph per row" section, and toolbar-restraint tests.

## Out of scope (as built)

- **Dimming context-only ancestors.** Considered — a match and a row present only to hold it
  up are different things — but Achieve does not, the chip and count already explain the
  result, and a new grid-wide visual convention is not worth introducing on a guess.
- **Folding `showCompleted` into a State column filter.** It would change a load-bearing
  default and start showing completed parents of active work. Offered and declined.
- **The icon as a drag handle while the `icon` column is shown.** The glyph leaves the Name
  cell, so the outline's second drag handle goes with it; the row gutter still drags. Making
  the Icon column's glyph a handle is follow-up work.
- Any change to `byCategory`, which is an arrangement rather than a filter.

## Changes from original plan

| Change                                                              | Why                                                                                                                                                                                                                        |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fieldLabel` went from `Icon (moves it out of Name)` to `Type icon` | The first attempt explained the behaviour in the name, which then leaked into the column menu's button label and tooltip — "Icon (moves it out of Name) — sort, filter and column options". Caught by driving the app.     |
| Both columns shipped, rather than picking one                       | Asked; the answer was "a type column in addition to the Icon column… it's not even a filter I often use". That reframed it: the filter is a nice-to-have, so it must not cost the in-name icon, which decided the pairing. |
| `Focus only` retired as well                                        | Started as a judgement call in the question. Investigating it turned up the subtree-drop bug, which made removing it a fix rather than only a cleanup.                                                                     |

## Acceptance criteria

- [x] Filtering the Outline to `Type: Task` shows every task **with its full ancestor chain**
      (verified: 6 tasks + 6 ancestors = 12 rows, correctly indented).
- [x] Searching `bench` returns the match inside its Result Area → Goal → Project context
      instead of one orphaned row.
- [x] The `Type` column renders the word; the Name column keeps its glyph; nothing is drawn
      twice.
- [x] Showing `Icon` removes the glyph from the Name cell; hiding it restores it.
- [x] The Icon/Type filter checklist reads `Result Area / Goal / Project / Task` with counts,
      not `result_area`.
- [x] Outline toolbar is Show completed · By category · Search · Filter… · Show Fields ·
      Roomy/Dense · Reset this grid.
- [x] A stored `outline:filters` blob with `types` / `focusOnly` still parses and does not
      resurrect a hidden type with no control left to undo it.
- [x] `npm run test:unit` (1163), `npm run typecheck`, `npm run lint` clean.

## Follow-ups (new work — not amendments to this frozen spec)

- Make the Icon column's glyph a row drag handle, replacing the one the Name cell gives up.
- Revisit dimming ancestor-only rows if the filtered Outline ever reads as "the filter did
  nothing".
- `Show completed` as a State column filter, if the pre-grid reshape ever becomes the odd one
  out.
