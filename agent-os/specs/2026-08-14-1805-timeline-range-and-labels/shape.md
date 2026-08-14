# Timeline range and pin labels — Shaping Notes

**Status: frozen / complete** (2026-08-14)

## Scope

Two changes to the ribbon at `/library/timeline`, both from same-day feedback.

- **A range you set by dragging.** The ribbon draws the chosen stretch, filling the container.
  Double-click, or the toolbar chip's ✕, goes back to the whole life. It persists.
- **Event labels beside their dots**, wherever there is room for one.

Falling out of those:

- The `Fit | Decades | Years` zoom is **gone**, along with the horizontal scrolling it needed.
- The axis gains month granularity, since a window inside one year has no years to label.
- Bars are clipped at the window edges, and a clipped edge is drawn as its own thing.
- The container is measured, which the parent spec had explicitly decided not to do.

### Out of scope

- **From/To pickers.** Offered during shaping and declined in favour of the drag.
- **Keyboard access to the range.** Recorded as a follow-up, not silently skipped: the gesture is
  pointer-only and the chip can only clear. This is the one place this delta is knowingly thinner
  than `navigation.md` would like.
- **Panning a narrowed window.** You re-drag from the whole life, or clear and drag again. A pan
  gesture would fight the vertical scroll for the same pixels the selection drag already claims.
- **Labels on bars beyond their own truncation**, and **labels on pins that do not fit**. The
  tooltip and the detail strip already carry the full text.
- Everything the parent spec put out of scope — filtering the picture, editing from it, an age
  axis, a pin lane per category.

## Decisions

### Why the range replaces the zoom rather than joining it

Both were offered. `Fit | Decades | Years` answered "how magnified", and a range answers "of
what" — but in a picture that always fills its container those are the same question, because
narrowing what you draw _is_ magnifying it. Keeping both would put four controls on the bar, two
of which overlap, and would keep the horizontal scrolling that made the phone a bad place to read
a life.

The zoom's real failure was that it magnified around the _start_. `Years` put 1997 on screen at
200px per year and left you panning to reach 2015. Nobody wants a wider 1997.

### The drag, and the three things it must not break

Lee chose dragging over From/To pickers. It is the direct gesture — you point at the stretch you
mean — but it lands on a surface already covered in buttons, and on touch it competes with the
scroll. Three constraints, none free:

1. **A drag must not steal a scroll.** `touch-action: pan-y` hands the browser the vertical axis
   and us the horizontal one, and the shared `swipeAxis` lock (`lib/touch/swipe.ts`, already the
   arbiter for row swipes) keeps a crooked gesture from committing.
2. **A drag must not also be a click.** Bars and pins are real buttons; a selection that started on
   one would open a record on release. A capture-phase handler eats exactly the one click that
   follows a drag.
3. **A tap must stay a tap.** Below the lock distance nothing is selected and the click runs
   normally — which is the only reason a bar is still clickable.

### The chip is not a second setter

It names the current range and clears it. That is deliberate scope: the answer to "how do you set
it" was the drag, and a second setter would make the drag optional and therefore undiscoverable.
But a state you can enter needs a visible way out (`navigation.md`), and on iOS a double-tap is
Safari's zoom, not ours — so the exit cannot be the gesture alone.

### Three kinds of bar edge

The parent spec established two: a recorded date is solid and rounded, an unrecorded one is dashed
and square, "so an inferred boundary never looks like a recorded one". A window introduces a third
— a bar that carries on past the edge you chose — and it gets no border at all.

The rule underneath is the same one, and it is worth keeping in view when adding a fourth: **the
edge of a bar is a claim about a date, and three different claims may not share a drawing.**

### Measuring the container, which the parent spec declined to do

That spec chose to estimate from a label budget sized for a phone, on the grounds that measuring
"would buy a denser desktop axis at the cost of a `ResizeObserver` in a static picture". Two things
changed. The picture is not static any more — the range moves under it. And pin labels need to know
how many pixels sit between one dot and the next, which is not a percentage question and cannot be
faked. Estimating a string's rendered width from its character count would be wrong in exactly the
crowded cases the feature exists to handle, so instead the label is given the measured room as a
`max-width` and the browser truncates into it.

`useElementWidth` returns `null` until measured — the same shape as `useToday`, and for the same
reason: it is a fact about the browser, so the first paint is a drawing of what is known rather
than a placeholder.

### Packing moved to render time

`deriveRibbon` used to return packed sub-rows. Which bars are on screen now depends on the window,
and packing everything on the server then filtering leaves a lane holding three sub-rows and one
bar. So the derivation hands over a flat list per lane and the component packs what it is drawing.
`packLane` stays pure and stays tested; only its caller moved.

## Context

- **Visuals:** None. Two ASCII sketches during shaping, one per question.
- **References:** `lib/touch/swipe.ts` for the axis lock; the parent spec's `ribbon.ts` for
  everything the derivation already did; `useToday` for the "null until known" shape.
- **Product alignment:** Unchanged — personal reference data, beyond the Achieve reimplementation.

## Standards Applied

- `components/responsive.md` — the reason the zoom went: "horizontal scrolling is a failure state",
  and adaptive rather than shrunken. Also the 44px pin target and `touch-action`.
- `components/navigation.md` — a state you can enter needs a signposted exit, which is the chip.
- `components/data-grid.md` — the window persists through `useSetting` in the module's own scope,
  with per-key fallbacks; a stored `zoom` from the previous build degrades without taking the
  presentation with it.
- `development/dates.md` — calendar keys throughout, integer month arithmetic for the axis, and
  the axis label deliberately **not** routed through `useDateFormatter`: a tick is a scale, not a
  record's value, and "3/1/2015" on one would claim something happened that day.
- `development/testing.md` — every new decision that can be wrong is a pure function with a test:
  the tick step and its month fallback, the label room, the window clamp, the range inverse, and
  which bars survive a window.
- `development/clean-code.md` — the gesture reuses `swipeAxis` rather than growing a second axis
  lock.
