# Grid column track model: definite widths, one filler, horizontal scroll

**Status: frozen / complete** (2026-09-05)  
Spec folder: `agent-os/specs/2026-09-05-1506-grid-column-track-model/`

## Spec relationships

- **Extends:** `agent-os/specs/2026-07-31-1520-persistent-ui-state/` — drag-to-resize column
  widths, stored per grid scope. The storage, the clamps and the reset paths are unchanged.
- **Extends:** `agent-os/specs/2026-08-04-1900-column-menus-and-header-drag/` — the header's
  gestures and the menu that mirrors them. The resize handle keeps its place and its
  double-click reset.
- **Supersedes:** the layout assumption behind both — that a grid's name column is declared
  `minmax(Xrem,1fr)` and absorbs whatever the other columns do not use, so a grid always
  fits its container exactly and never scrolls sideways.

## Context

Reported: resizing a column in Bills (and everywhere else) behaves backwards — to make the
name column narrower you drag some other column's right edge to the _right_, and the left
edge of the column you grabbed moves left.

Measured on `/finances/bills` at 1552px, dragging the Group handle 100px right:

|                      | before                 | after                  |
| -------------------- | ---------------------- | ---------------------- |
| Bill (name)          | left 88, **720 wide**  | left 88, **620 wide**  |
| Group                | **left 820**, 160 wide | **left 720**, 260 wide |
| Next charge → Status | left 992…              | left 992… (unmoved)    |

The grabbed edge (Group's right edge, x=980) did not move at all. The column grew leftward
by exactly what the cursor travelled right, because the name column paid for it.

**Root cause.** Every grid declared its name column `minmax(Xrem,1fr)` — 66 such tracks
across 30 column files. That elastic track was the layout's only shock absorber and it sat
_first_. `ResizeHandle` wrote an absolute pixel width for the dragged column and left the
redistribution to CSS Grid, so the flexible column silently funded every drag, from the
left. The resize was never inverted; it was non-local, and the slack was on the wrong side
of every handle.

**A second consequence of the same cause.** Once the fixed columns outgrew the container the
name column floored at its `minmax` minimum and the rest of the grid fell off the right edge
with **no horizontal scrollbar**: rows carry `[content-visibility:auto]`, whose paint
containment clips them, and the header sat _outside_ the scroll container so it could not
scroll either. Forced on Bills (two columns to 760px), Amount, Cadence and Status became
unreachable.

Achieve Planner is an ordinary Windows grid here: "To change the size of a column you click
between the two headers … and drag to the new size" (`docs/achieve-planner/user-manual.md`
:1095). The boundary follows the pointer, and the grid scrolls sideways.

## Decisions

- **Every column contributes a definite track.** A column's `width` is its default width,
  never a share of the leftover. No `fr`, no `minmax`.
- **One elastic track, and it is last.** `buildGridTemplate` appends `minmax(0,1fr)`. Slack
  that lives at the end can only be taken from the end, so the grabbed boundary follows the
  pointer and nothing to its left moves.
- **`minmax(a,b)` collapses to `a`** if one is ever declared again. A second elastic track is
  the one mistake that reintroduces the bug; it lays out narrow instead of sideways.
- **The header moves inside the scroll container**, sticky at the top, on a shared "track
  surface" (`w-max min-w-full`) with the rows, group headers and footer. That is what lets a
  grid overflow: the surface grows to the columns, the scroller scrolls, and the header
  travels with the rows it labels.
- **The filler collapses to zero on overflow** and the grid scrolls horizontally, rather than
  squeezing columns or hiding them past the edge.
- **Grids no longer fill their width with content.** A short column set leaves visible empty
  space at the right, as Explorer does. Chosen deliberately over the alternatives below.
- **`buildGridTemplate` and the resize arithmetic move to `src/lib/grid/template.ts`** with
  tests. They were untestable logic living in `src/components/grid/`.
- **Default widths came from a mechanical rule:** `floor + 6rem × fr`, rounded — so the old
  floor and the old relative appetite both still show in the number. The shared `nameColumn`
  factory was then bumped to `30rem` by hand, because the rule left the Outline's name column
  truncating rows it used to fit.

### Alternatives rejected

| Option                                                 | Why not                                                                                                                                                                                            |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Trailing filler, but clamp so the grid never overflows | Fixes the reported bug and nothing else; a drag would be silently refused once the filler hit zero, and a wide default column set could still put columns past the edge with no way to reach them. |
| Neighbour exchange (K grows, K+1 shrinks)              | Smallest diff, boundary follows the pointer — but shrinking a column always fattens its right neighbour, and the last column's handle would do nothing.                                            |

## Acceptance

- [x] Dragging a column's right edge moves _that_ edge with the pointer; columns to its left
      do not move; columns to its right shift by the same amount.
- [x] Double-click on the handle, and Reset width in the column menu, restore the declared
      default.
- [x] When the columns outgrow the container the grid scrolls horizontally and the header
      stays aligned with the body at every scroll offset (verified at `scrollLeft: 500` —
      header and body cell lefts identical to the pixel).
- [x] The header stays pinned to the top of the scrollport on vertical scroll.
- [x] An empty grid's panel still centres over the scrollport below the header.
- [x] The phone layout is unchanged: no track surface width, no horizontal overflow.
- [x] Row drag, group headers, footers, virtualised grids and `autoHeight` grids all still
      render and behave.

## Verification

Driven in a real browser (`.agents/skills/run-planner/driver.mjs`), on Bills, Outline,
Activity (virtualised), Budget (three `autoHeight` grids), Insights, Find and Goals, plus
390×844 for the compact path. `npm run lint`, `npm run typecheck`, `npm run test:unit`
(338 files / 3998 tests) and `npm run smoke` (62 routes) all green.

## Changes from original plan

| #   | Change                                                                                               | Why                                                                                                                           |
| --- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 1   | The empty-state slot became `grid flex-1` rather than `flex-1`.                                      | A panel centring on `h-full` got no height from a plain flex item; `display:grid` stretches it into the box instead.          |
| 2   | The Outline's explicit name width was dropped and the shared `nameColumn` default raised to `30rem`. | The mechanical `floor + 6rem × fr` rule gave the Outline a 22rem name column, which truncated indented rows that used to fit. |

## Follow-ups (new work — not amendments to this frozen spec)

- `nameColumnLeft` (the child-drop indicator's offset) reads **declared** widths and ignores
  stored overrides, so the drop line is wrong when a column before the name column has been
  resized. Pre-existing, untouched here.
- Per-grid default widths were set by rule, not by looking at each grid. Some (Notes title,
  Bills name) may want a hand-picked number.
- The resize handle is a 4px target inside the cell, not the 12px boundary between two
  headers that Achieve describes.
