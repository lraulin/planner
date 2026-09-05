# Shaping: grid column track model

**Status: frozen / complete** (2026-09-05)

## How this arrived

Not shaped up front. It came in as a bug report — "weird unintuitive behavior with drag to
resize columns (in at least Bills, probably elsewhere)" — and `/fix-bug` took it as far as
the root cause before the scope question turned into a design decision that had to be put to
the developer. This folder is the as-built record of that decision, written after the fix.

## The scope question

The cause was one line of layout model (`minmax(Xrem,1fr)` on the name column) repeated 66
times, but no fix for it is local: the elastic track is what kept every grid exactly as wide
as its container, which is what let the header sit outside the scroll container and stay
aligned with the body. Move the slack and that arrangement has to move too.

Three options were put up, with the measured before/after numbers first:

1. **Full Windows-grid model** — definite widths, trailing filler, header inside the scroller
   as sticky, horizontal scroll when the columns outgrow the width.
2. **Filler only, never scroll** — same widths and filler, but drags clamp so the grid always
   fits.
3. **Neighbour exchange** — keep the `1fr`, move the boundary by trading pixels between the
   two adjacent columns.

Chosen: **1**. It is what Achieve does, what every desktop grid does, and it is the only one
of the three that also closes the "columns fall off the right edge, unreachably" hole that
the same cause opened.

## What the choice costs

Grids no longer stretch to fill their width. Bills' name column was 720px because it was
soaking up 432px of slack; it is now 288px with the filler holding the rest. The Outline's
was 1040px. That empty band at the right of every grid is the visible price of a local
resize, and it is what Explorer looks like.

It also means default widths matter now, where before only the `minmax` floor did — and a
mechanical conversion is not always right (see Changes from original plan #2).

## Deliberately out of scope

- The resize handle's hit area and its position relative to the column boundary.
- `nameColumnLeft`'s indifference to stored width overrides.
- Anything about the compact/phone layout, which has no columns and no header.
