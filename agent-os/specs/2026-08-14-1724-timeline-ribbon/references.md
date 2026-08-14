# References for Timeline ribbon

## Governing specs

### `agent-os/specs/2026-08-13-2006-life-history/`

- **Relationship:** Extends; **supersedes its Decision 6 only**.
- **Carries forward:** the chronology grid as "what happened, in order"; job and residence dates
  derived at read time and never copied; exact `YYYY-MM-DD` dates; free-text categories; the
  `date({ mode: "string" })` encoding; Timeline's row menu disabling Delete on a derived row.
- **Superseded:** Decision 6's guess that the picture would arrive as a second Library page.
  It arrives as an in-page toggle. See `shape.md`, "Why a toggle and not a second page".
- **Explicitly re-opened by this spec:** its out-of-scope note said to "shape the picture around
  what the data turns out to look like". There is still no local data, so the design is for
  sparsity; the one thing left genuinely open — whether pins split into a lane per category — is
  recorded as out of scope with a revisit trigger rather than guessed at.

### `agent-os/specs/2026-08-13-0747-module-pages/`

- **Relationship:** Extends, by not using it.
- **Relevant decisions:** the Page tier, the ≥2-page bar floor, `lastPage` stickiness. Library
  keeps its five pages. This spec's presentation toggle sits one tier _below_ Page — it is
  closer to Density than to a destination — which is why it lives on the lens row and in a
  settings scope rather than in `pages.ts`.

### `agent-os/specs/2026-08-10-1940-daily-use-performance/`

- **Relationship:** Cited to justify a deliberate divergence.
- **Relevant decisions:** "load only what the page needs", which is what turned Notes'
  `Grid | Journal` from a client-side mode into two routes. The divergence is safe here because
  both presentations derive from one identical read; see `shape.md`.

### `agent-os/specs/2026-08-12-2031-finances-insights-dashboard/` and `2026-08-13-2121-insights-interactive-reports/`

- **Relationship:** Neither; cited for pattern reuse.
- **Relevant decisions:** the `insights` settings scope read through `useSetting`, the `Panel`
  chrome, and `--chart-cat-*` as "a third colour job, not a reuse of priority or type tokens".
  The `timeline` scope is modelled directly on `insights`.

## Similar implementations

### The parallel derivation

- **Location:** `src/lib/timeline/chronology.ts`
- **Relevance:** `deriveRibbon` is its sibling — same three inputs, different projection. Its
  header comment is where the derived-not-copied rule is written down.
- **Key patterns:** pure function taking `(events, jobs, residences)`, with a thin
  `load*(userId)` wrapper doing three scoped queries in one `Promise.all`. `loadLifeHistory`
  extracts that wrapper so both projections share one read.

### Span duration

- **Location:** `src/lib/history/span.ts`
- **Relevance:** already computes `"3y 2m 14d"` and an ongoing flag from a `{ start, end }` and
  a `todayKey`. The ribbon's detail strip reuses it exactly rather than formatting its own.
- **Key patterns:** the `todayKey: string | null` signature that makes a client-resolved today
  explicit in the type.

### Segmented controls

- **Location:** `src/components/grid/GridToolbar.tsx` (`DensityToggle`),
  `src/components/finances/insights/InsightsView.tsx` (`ToggleGroup`)
- **Relevance:** the same control written twice. Extracted to `ToolbarSegments` in
  `src/components/tabs/tabChrome.tsx` and both callers converted, so the presentation toggle is
  not a third copy.
- **Key patterns:** `role="group"` + `aria-pressed`, `min-h-tap` on phones, `bg-select` for the
  pressed segment, no label word where the buttons say it themselves.

### Toolbar composition

- **Location:** `src/components/tabs/tabChrome.tsx` (`TabToolbar`), `src/components/grid/GridToolbar.tsx`
- **Relevance:** the ribbon needs a toolbar without a grid behind it — the case `TabToolbar`
  already handles for Fitness, where the lens row is empty and `⋯` is phone-only.
- **Key patterns:** `left` lands in the **lens** row, which is the row that survives below `md`;
  `commandRow` is desktop-only, so the presentation toggle must not live there.

### Client-resolved today

- **Location:** `src/components/grid/useToday.ts`
- **Relevance:** the today rule and every open-ended bar depend on it. `null` before hydration is
  the correct first render, not a placeholder.

## The sketch Lee picked

```
        1998    2002    2006    2010    2014    2018    2022   ○today
       ┌───────────────────────────────────────────────────────────┐
 Home  │ ├─Seoul──┤   ├─Austin─────────┤ ├─Portland──────────────┤ │
 Work  │      ├─Acme────┤    ├─Globex──────┤  ├─Initech──────────┤ │
 Life  │   ▲     ▲   ▲        ▲    ▲ ▲          ▲        ▲    ▲    │
       └───────────────────────────────────────────────────────────┘
             └ graduated            └ bought the car

  hover/tap a bar or pin → title, dates, duration
  click → opens the record on Jobs / Residences
```
