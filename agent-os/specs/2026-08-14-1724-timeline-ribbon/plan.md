# Timeline ribbon — the life-history visualization

**Status: frozen / complete** (2026-08-14)  
Spec folder: `agent-os/specs/2026-08-14-1724-timeline-ribbon/`

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-13-2006-life-history/` — the chronology grid, the
  derived-not-copied rule, exact dates, free-text categories, and `date({ mode: "string" })`
  storage. All carry forward unchanged.
- **Supersedes:** `agent-os/specs/2026-08-13-2006-life-history/` **Decision 6 only** — "a later
  delta adds `Grid | Timeline` presentations the way Notes has `Grid | Journal`". The pair
  ships, but as an in-page toggle rather than as a second Library page. Reasoning in
  `shape.md`; nothing else in that spec changes.

## Context

The life-history spec shipped `/library/timeline` as a chronology grid — one row per date,
with a job's span deliberately split into two point rows ("Started at Acme", "Left Acme"). It
put the picture explicitly out of scope: _"build the grid, get real data in, then shape the
picture around what the data turns out to look like."_

This is that deferred item. The picture earns its place by saying the one thing the grid
refuses to say: **duration and overlap**. How long each job and each address lasted, and which
ones ran at the same time. Life events stay points — pins on a third lane.

It is designed for sparsity and for a range measured in decades, not tuned to a dataset: the
local database has zero life-history rows.

## Decisions

| #   | Decision                                                                                                                                                                                                                                |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **A horizontal ribbon**: lanes across a year axis, `Home` and `Work` as bars, `Life` as pins, a today rule. Chosen over a vertical narrative timeline, which would be a prettier restatement of the grid.                               |
| 2   | **A toggle inside `/library/timeline`, not a second page.** Both presentations come from the same three queries, so a URL would buy nothing and spend a page-bar row. See `shape.md` for why this differs from Notes `Grid \| Journal`. |
| 3   | **One server read, two derivations.** `loadLifeHistory` returns the three lists once; `deriveChronology` and `deriveRibbon` are both pure over it.                                                                                      |
| 4   | **The ribbon derives from the records, not from the chronology rows.** A bar is labelled "Acme", which only `jobs` knows; recovering it by stripping `"Started at "` would be a parser over our own prose.                              |
| 5   | **Hand-rolled HTML/CSS, not Recharts.** Recharts has no span mark. Percentage-positioned `<button>`s give real focus, tap targets and truncating labels; SVG gives none of those for free.                                              |
| 6   | **The presentation and zoom persist**, in a new singleton `timeline` settings scope. A presentation you re-pick every visit is one you stop using.                                                                                      |
| 7   | **Today comes from `useToday()`**, so an open-ended bar and the today rule resolve one beat after paint rather than from the server's UTC.                                                                                              |
| 8   | **Pins are life events only.** Job and residence dates are already the bar edges; drawing them again would double every move.                                                                                                           |

## Acceptance criteria

- [x] `/library/timeline` offers `Grid | Timeline` and remembers the choice across a reload.
- [x] Jobs and residences draw as bars on a year axis; overlapping ones stack rather than collide.
- [x] A job with no end date runs to the today rule and reads as ongoing.
- [x] A residence with only a `movedOut` date draws from the left edge rather than vanishing.
- [x] Life events draw as pins, coloured by category, with a legend.
- [x] Hovering or focusing a bar or pin names it, its dates and its duration.
- [x] Clicking a bar opens that record on Jobs / Residences; clicking a pin returns to the grid
      with that row selected.
- [x] The ribbon is usable at 390px: horizontal scroll, 44px tap targets, no clipped chrome.
- [x] An empty history says so rather than drawing an empty axis.
- [x] No new database query, mutation or migration.

## Changes from original plan

| #   | Change                                                                                                                                | Why                                                                                                                                                                                                                                                                     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `deriveRibbon` takes **no** `todayKey`. Everything today-dependent moved into `ribbonRange(bounds, todayKey)` and into the component. | The plan had one function taking today, which would have made the whole derivation client-only and untestable without freezing a clock. Splitting it keeps the expensive half on the server and deterministic, and makes `todayKey === null` a first-class tested case. |
| 2   | Bars carry no duration string; the detail strip calls `spanDuration` at render.                                                       | Same reason — a duration measured against today cannot be precomputed on the server.                                                                                                                                                                                    |
| 3   | The "what to call a nameless record" rule was extracted to `src/lib/timeline/naming.ts` and is now shared with `deriveChronology`.    | The grid and the ribbon draw the same records. "Started at an unnamed employer" beside a bar labelled something else is one record wearing two names — a business rule, so `clean-code.md`'s DRY exception applies.                                                     |
| 4   | The ribbon hugs its content instead of filling the page.                                                                              | Seen on the built thing: three lanes are a few hundred pixels tall, and stretching pushed the colour key to the bottom of an empty screen with nothing between the two.                                                                                                 |

## Task 1: Save spec documentation

`plan.md` (active), `shape.md`, `standards.md`, `references.md`. No visuals — the shape was
agreed from ASCII sketches in the shaping conversation.

## Task 2: Ribbon derivation

`src/lib/timeline/ribbon.ts` + `ribbon.test.ts` — `deriveRibbon`, sub-row packing, pin colour
assignment, range, `axisTicks`. `loadLifeHistory` in `chronology.ts`, with a second-user case in
`mutations.integration.test.ts`.

## Task 3: The `timeline` settings scope

`src/lib/settings/timeline.ts` + test; `TIMELINE_SCOPE` and the new kind in `scopes.ts`.

## Task 4: Shared segmented control

`ToolbarSegments` in `tabChrome.tsx`; convert `GridToolbar`'s `DensityToggle` and `InsightsView`'s
`ToggleGroup` in the same pass so this feature is not the third hand-rolled copy.

## Task 5: `TimelineRibbon`

Lanes, bars, pins, axis, today rule, detail strip, legend, zoom, empty state.

## Task 6: Wire the toggle

`TimelineView` owns the presentation; `page.tsx` loads once and passes both payloads;
`listChronologyAction` becomes `listTimelineAction` so an edit refreshes the picture too.

## Task 7: Verify, freeze spec, update roadmap

`test:unit` (watch for the Postgres skip warning), `lint`, `typecheck`, `build`, and `smoke`
with the dev server up. Seed a few records by hand and screenshot both presentations at desktop
width and 390px. Push to `master` — validation happens on the deployed iPhone.

---

**Standing rule while this spec is active:** material changes to requirements, design or scope —
including feedback on what gets built — go into `plan.md` / `shape.md` plus a row in **Changes
from original plan**. Skip pure implementation detail. Freeze when verified.
