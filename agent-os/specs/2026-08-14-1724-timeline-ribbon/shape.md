# Timeline ribbon — Shaping Notes

**Status: active**

## Scope

A second presentation of `/library/timeline`: a horizontal ribbon of the whole life.

- **Home** lane — one bar per residence, `movedIn` → `movedOut`.
- **Work** lane — one bar per job, `startDate` → `endDate`.
- **Life** lane — one pin per life event, coloured by category.
- A year axis with an adaptive tick step, a today rule, and a zoom (Fit · Decades · Years).
- Hover / focus writes to a detail strip under the ribbon: title, dates, duration.
- Click a bar → the record on Jobs / Residences. Click a pin → back to the grid, that row
  selected.

### Out of scope

- **A vertical narrative timeline.** Offered during shaping and declined. It reads well on a
  phone but is one card per date — which is what the grid already is, with more scrolling.
- **Editing from the ribbon.** It is a reading surface. `New event` and every row verb stay on
  the grid, which is one toggle away.
- **Filtering the ribbon.** The grid's search, filters and grouping apply to the grid. Wiring
  them through to the picture means running `DataGrid`'s filter pipeline outside `DataGrid`;
  the ribbon shows everything until there is a reason it cannot.
- **Age.** No birth date exists as a first-class field, so an age axis would be inferred from
  whichever event happens to be earliest. Deferred until there is something to anchor it to.
- **One pin lane per category.** Categories are free text and could be anything; the single
  `Life` lane with a colour legend degrades gracefully at any cardinality. Revisit once there
  is real data — this is exactly the kind of thing the life-history spec deferred the picture
  to learn.
- **Deriving spans from anything else.** Same boundary the life-history spec drew.

## Decisions

### Why a toggle and not a second page

The life-history spec guessed this would land as a `Grid | Timeline` **page** pair, "the
mechanism Notes already uses for `Grid | Journal`". It ships as an in-page toggle instead, and
the reason matters because the page-based direction is otherwise the house style
(`module-pages`, `daily-use-performance`).

Notes split into routes because of **load cost**. `/notes/grid` needs the note list;
`/notes/journal` needs `loadDiarySummaries` to build a date tree. Deciding between them on the
client meant every visit paid for both, which is precisely what `daily-use-performance` set out
to stop.

Timeline has no such split. Both presentations are derived — in pure functions, in memory —
from the same three queries the page already runs. Promoting the choice to a URL would buy no
work back; it would spend a sixth row in the Library page bar and, worse, would make the
_chronology_ and the _picture_ read as two features when they are two drawings of one dataset.

The mechanism that _is_ borrowed from Notes is stickiness: `moduleEntryRedirect` remembers your
page, and this remembers your presentation, in a `timeline` settings scope alongside `insights`.

### Chronology rows are the wrong input for the picture

The obvious implementation reuses the payload the grid already has. It does not survive
contact: a chronology row's title is prose (`"Started at Acme"`, `"Moved to Seoul"`), and the
bar wants the bare name. Recovering it means matching our own sentence templates — a parser
over strings we generated three lines earlier.

So `deriveRibbon` takes the same three record lists `deriveChronology` takes. `loadLifeHistory`
exists so they share one read; both stay pure and separately testable. This also keeps the
life-history spec's rule intact — nothing is copied, everything is derived at read time.

### Overlap is the point, so packing is the risky part

Two addresses can overlap (a lease that runs past a move); two jobs can overlap. Bars therefore
pack into sub-rows by greedy first-fit on start date, and the lane grows to fit. That is the
one piece of geometry with a plausible wrong answer that looks right on a single-bar dataset,
so it is where the tests concentrate.

Half-open spans are the other. A job with a start and no end is ongoing and runs to the today
rule. A residence with only `movedOut` — a real shape, since you may remember leaving and not
arriving — draws from the left edge rather than disappearing. Both get a soft edge so an
inferred boundary never looks like a recorded one.

### Not Recharts

Recharts is the app's chart library and has no span or Gantt mark; a stacked bar faked into one
is a well-known trick and a bad one. Nothing here is quantitative — it is a layout in one
dimension, where the marks need to be focusable, tappable at 44px, and able to truncate their
own labels. Percentage-positioned `<button>` elements get all of that from the platform. Inline
SVG would mean re-implementing focus rings, hit areas and text ellipsis by hand.

### Colour

Lanes take `--chart-cat-1` / `--chart-cat-2`. Pins take a cat var by **sorted-distinct-category
index**, never by hash: a hash gives a stable colour per string, but the palette then depends on
which categories exist elsewhere, and two adjacent categories can collide with no way to fix it.
Index assignment is deterministic given the data and readable in the legend.

## Context

- **Visuals:** None. The shape was agreed from ASCII sketches during shaping; the ribbon sketch
  Lee picked is reproduced in `references.md`.
- **References:** `src/lib/timeline/chronology.ts` (the derivation this parallels);
  `src/lib/history/span.ts` for `spanDuration`; `src/components/finances/insights/` for panel
  chrome, chart tokens and the `useSetting` pattern; `src/components/tabs/tabChrome.tsx` for
  toolbar chrome; `src/components/grid/useToday.ts`. Full list in `references.md`.
- **Product alignment:** Beyond the Achieve reimplementation, like the rest of life history.
  Achieve has no equivalent surface.

## Standards Applied

- `components/data-grid.md` — the toolbar's two-row verbs/lens split, and the rule that a
  preference persists through `useSetting` in the module's own scope where there is no
  `GridToolbar` to hold it.
- `components/navigation.md` — the presentation is a widget on the lens row, like Density, not a
  command; and a verb that is unavailable here is unavailable with a reason.
- `components/responsive.md` — 44px tap targets, adaptive rather than shrunken, horizontal pan
  instead of a squeezed decade.
- `components/ux-principles.md` — icon-free controls that say what they do; no modal for a
  reading surface.
- `development/clean-code.md` — `app → components → lib`; one shared implementation per concern,
  which is why the segmented control gets extracted rather than copied a third time.
- `development/dates.md` — calendar-day keys throughout, integer arithmetic on key components,
  `useToday()` for anything that depends on the reader's clock.
- `development/testing.md` — the pure derivation is tested hard, the component is not tested at
  all, and the touched integration test keeps its second-user case.
