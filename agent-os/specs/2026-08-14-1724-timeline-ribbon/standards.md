# Standards that apply

**Status: frozen / complete** (2026-08-14)

Analysis of how each standard governs this work, not a copy of it. The standards themselves
live under `agent-os/standards/` and remain the text of record.

---

## `components/data-grid.md`

The standard that decides where the presentation toggle's state lives.

- **"Every user-visible grid preference goes into the `grid:{tabId}` scope … never into
  component `useState`."** The presentation is a user-visible preference of this page, so
  `useState` is out even though it is a single boolean-ish value.
- **"The rule is about the preference, not the hook."** The ribbon has no `GridToolbar` behind
  it and could not use `useGridState` even if it wanted to. The standard's own answer applies:
  `useSetting` with a codec of its own, in a scope belonging to that module. Hence the new
  `timeline` scope, modelled on `insights`.
- **"One hook owns the whole scope."** `timeline` holds both keys the page persists
  (presentation, zoom) and is read by exactly one hook in `TimelineView`, which passes the zoom
  down. Two hooks on one scope would clobber each other on write.
- **"Parse with a per-key fallback."** The codec has to be additive-safe from the start — a blob
  written today must keep its presentation when the zoom key is added or renamed later.
- The two-row **verbs / lens** split governs where the toggle sits: it changes what you are
  looking at, not what you can do to a row, so it is lens, not verb.

## `components/navigation.md`

- **"A command without a menu entry is not shipped."** The presentation toggle is deliberately
  _not_ a command. It is a widget on the lens row, the same tier as Density and the Filter
  button — controls whose own affordance is visible, which the standard treats as `ownControl`
  rather than as a menu item. Adding `Show the timeline picture` to the View menu would be a
  second path to a control already on screen in both states.
- **"Unavailable is disabled with the specific reason, never absent."** This is why the ribbon
  is not allowed to quietly drop the row verbs. `New event`, `Open` and `Delete` belong to the
  grid; the ribbon presents a toolbar that offers the toggle back rather than a command row with
  everything greyed out.
- The Page tier is _not_ used here — see `references.md`. A presentation is below a page.

## `components/responsive.md`

The standard most likely to be violated by a picture measured in decades.

- **"If a view cannot be re-thought … it degrades gracefully — it scrolls horizontally inside
  its own container and says so. It does not get squashed."** This is the explicit sanction for
  the ribbon's horizontal scroll, and the reason the zoom control's default is `Fit`: the phone
  gets a whole life at a glance first, and pans only when the reader asks for detail.
- **"The page body never scrolls horizontally."** The scroll belongs to the ribbon's own
  `overflow-x` container, never to the shell.
- **"44 × 44 px minimum below `md`. Use `--tap-target`."** A pin's dot is a few pixels wide; its
  hit area is not. Bars are already tall enough but must not become thin slivers when a span is
  short — a one-week job at Fit zoom is sub-pixel wide, so bars take a minimum rendered width.
- **"There is no hover on touch."** The detail strip is written by focus and tap as well as
  hover, which is also why it is a strip rather than a floating popover: nothing to position,
  nothing that a tap cannot reach.
- **"Spacing matters as much as size."** Adjacent pins on nearby dates will collide at Fit zoom.
  They are allowed to overlap visually, but the reader gets the zoom control to separate them
  rather than a heuristic that hides some of them.
- The **verification checklist** is the gate, because there are no component tests. 390 × 844
  first, then 1280 × 800 again.

## `components/ux-principles.md`

- **"Modals only for confirmations and capture."** A picture is neither, so nothing here opens
  one. Detail appears in place.
- **"Icon-only buttons need a title tooltip."** The ribbon's marks are not icons, but they are
  unlabelled at small sizes, so every bar and pin carries a full accessible name (`"Acme ·
Mar 2004 – Jun 2011 · 7y 3m"`) rather than relying on the strip alone.
- The outline-grid-plus-drawer model is untouched: clicking a bar navigates to the record's own
  page with `?detail=`, exactly as the Timeline grid's `Open` already does.

## `development/clean-code.md`

- **`app → components → lib → db`.** `ribbon.ts` is pure and imports nothing from `components`;
  `TimelineRibbon` imports it and never touches the database; `page.tsx` stays a loader.
- **"One shared implementation per concern."** The segmented control already exists twice by
  hand. Writing a third is what the standard names as the failure mode, so it is extracted to
  `ToolbarSegments` and both existing callers are converted in the same change.
- **"No speculative generality."** `deriveRibbon` returns exactly the two lane kinds that exist.
  There is no lane registry, no plugin shape, no configurable projection — a third lane would be
  a small edit when there is a third thing to draw.
- **"DRY only for business rules."** Duration is a business rule and is reused from
  `spanDuration`. Bar geometry is presentation and lives with the component that draws it.

## `development/dates.md`

- **"No business rule may depend on the server's `TZ`."** The ribbon's right edge, the today
  rule and every ongoing bar depend on today, so today arrives from `useToday()` and is `null`
  until hydration. The range is computed client-side from that value; the pre-hydration render
  ends at the last recorded date, which is correct rather than a placeholder.
- **Calendar day, never an instant.** Every input is already a `YYYY-MM-DD` string
  (`date({ mode: "string" })`, inherited from the life-history spec). Positioning uses
  `daysBetweenKeys` on keys; no `Date` is constructed for layout.
- **"`startOfDay` / `addDays` in `dateMath.ts` are local wall-clock helpers."** Year-boundary
  arithmetic for the axis ticks is integer arithmetic on key components, the same choice
  `elapsed.ts` made and for the same reason.
- **Testing requirement.** Year and month boundaries are mandatory cases: a span that starts on
  Jan 1, one that ends on Dec 31, and a leap day inside the range.

## `development/testing.md`

- **"Put real logic in `src/lib/**` and write a `foo.test.ts` beside it."** All of the geometry
  that can be wrong — packing, half-open spans, range padding, tick step — is in `ribbon.ts`,
  not in the component, precisely so it can be tested.
- **"A test earns its place if it would fail on a plausible mistake."** The cases chosen are the
  ones that pass on a one-bar dataset and fail on a real one: overlapping bars, a bar with no
  start, a bar with no end, a single-day span, `todayKey === null`, and an empty history.
- **"Do not write React component tests."** `TimelineRibbon` gets none. Its gate is the
  responsive checklist and the screenshots.
- **"Anything touching the database gets a `*.integration.test.ts` … with a second user."**
  `loadLifeHistory` is a new database read, so it gets a cross-user case even though it is a
  refactor of an existing one. **Check for the Postgres skip warning** — a green `test:unit`
  does not mean it ran.
- **"A green gate is not proof the app runs."** `src/app/library/timeline/**` changes, so
  `npm run smoke` against a running dev server is part of done.

## `development/commits.md`

One logical change per commit; an imperative subject naming the effect; a body saying why where
the diff does not. The spec folder is the governing intent, cited by its `Spec` trailer.
