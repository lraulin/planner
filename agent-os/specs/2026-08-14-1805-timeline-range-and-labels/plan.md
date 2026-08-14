# Timeline range and pin labels

**Status: frozen / complete** (2026-08-14)  
Spec folder: `agent-os/specs/2026-08-14-1805-timeline-range-and-labels/`

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-14-1724-timeline-ribbon/` — the ribbon itself: lanes, bars,
  pins, packing, the derived-not-copied rule, the in-page `Grid | Timeline` toggle, the `timeline`
  settings scope, and hand-rolled marks rather than Recharts. All carry forward.
- **Supersedes:** `agent-os/specs/2026-08-14-1724-timeline-ribbon/` **Decision 6, in part** — the
  `Fit | Decades | Years` zoom, and with it the `zoom` key in the `timeline` scope. A **range**
  replaces it. Persistence itself is unchanged; the key holds a window now.
- **Supersedes:** the same spec's `axisTicks` decision that the container is never measured
  ("measuring … would buy a denser desktop axis at the cost of a `ResizeObserver` in a static
  picture"). The picture is no longer static and labels need real widths, so it measures.

## Context

Feedback on the ribbon the day it shipped, from Lee:

> Should be able to set the range to see, and would be nice to be able to see labels for events
> without needing a tooltip if they can fit.

Both are the same complaint from two directions: the ribbon showed a whole life at once and told
you nothing about any of it without a hover. The zoom control did not fix the first — `Years` made
the axis bigger and then made you pan sideways to reach 2015, which is the long way round to "show
me 2015", and on a phone it meant a life measured in screens.

## Decisions

| #   | Decision                                                                                                                                                                                                                                                            |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **The range replaces the zoom.** The drawing always fills the container, so narrowing the range _is_ zooming in. One idea where two were fighting; no horizontal scrolling, and a phone behaves like a desktop.                                                     |
| 2   | **You set it by dragging across the ribbon**, and double-clicking clears it. Chosen over From/To dropdowns: direct, and the picture is the thing you are pointing at anyway.                                                                                        |
| 3   | **A chip in the toolbar names the current range and clears it.** The drag is an invisible affordance; `navigation.md` does not let a state you can get into have no signposted exit — and on a phone a double-tap is the browser's zoom gesture, not ours.          |
| 4   | **The window is stored as two date keys, not two years.** A drag lands where it lands; rounding it to years would undo the gesture. The chip still _reads_ in years, because that is the question it answers.                                                       |
| 5   | **A clipped bar edge is a third visual state.** Recorded is solid and rounded, unrecorded is dashed and square, running past the window is borderless and square. "Still there", "we don't know" and "carry on past the edge you chose" are three different claims. |
| 6   | **Pin labels get the room measured up to the next pin, and truncate into it.** Below 44px there is no label rather than an ellipsis and a letter. Nothing estimates how wide a string renders — the browser already knows.                                          |
| 7   | **The container is measured** (`useElementWidth`, a `ResizeObserver`). Both the tick step and the label room need real pixels; the previous "assume a phone" estimate was safe and wrong at 1440px. `null` before measurement, the same shape as `useToday`.        |
| 8   | **Packing moved to render.** Which bars are on screen depends on the window, and packing the whole life on the server then filtering leaves lanes full of sub-rows holding nothing.                                                                                 |
| 9   | **The axis gains months.** A window inside one year labelled only "2015" says nothing; steps run 1/3/6 months then 1/2/5/10/25/50/100 years, chosen from the measured width.                                                                                        |

## Acceptance criteria

- [x] Dragging across the ribbon narrows it to that stretch, with a live band and the pending
      dates named while the pointer is down.
- [x] The drag works with real touch events and does not steal the page's vertical scroll.
- [x] A drag that starts on a bar does not also open that bar's record.
- [x] A tap or click on a bar still opens the record.
- [x] Double-clicking the ribbon, or the toolbar chip's ✕, returns to the whole life.
- [x] The window persists across a reload.
- [x] Bars and pins outside the window are dropped, and lanes re-pack to the bars left.
- [x] A bar running past the window's edge is drawn flush, distinguishable from both a recorded
      date and an unrecorded one.
- [x] Event titles show beside their dots wherever there is room, and are absent where there is not.
- [x] The axis drops to months when the window is short enough to need them, and never draws a
      mark behind the left edge.
- [x] No new database query, mutation or migration.

## Changes from original plan

| #   | Change                                                                                       | Why                                                                                                                                                                        |
| --- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | A toolbar chip was added, which the shaping answer ("drag, not dropdowns") did not call for. | Drag is invisible and double-tap is the browser's own gesture on iOS. Without a visible exit, a narrowed ribbon is a state with no way out on the device Lee validates on. |
| 2   | The pin label is a sibling of the tap target rather than a child of it.                      | The dot is centred on its date and the label starts at it; nesting offset every label by half the 44px target, which was visible in the first screenshot.                  |

## Verification

Full suite (integration included), lint, typecheck, production build in a worktree, `smoke`.
Driven in a real browser at 1280×800 and 390×844, both colour schemes: mouse drag, **touch** drag
(`tswipe`, the only thing that exercises `touch-action`), double-click reset, chip reset, reload
persistence, and a bar click landing on the right record.

---

**Follow-ups (new work — not amendments to this frozen spec)**

- Keyboard access to the range. There is none: the drag is pointer-only, and the chip can only
  clear. `navigation.md` would want a command; nothing here adds one.
- A pin lane per category, still deferred from the parent spec, and now more attractive since
  labels make a crowded single lane harder to read.
