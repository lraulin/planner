# References for Stay on FullCalendar 6

## The registry evidence

This is the whole basis for the decision, and the first thing to re-check when revisiting it.
Captured 2026-08-27.

```
@fullcalendar/core          latest = 7.0.2
@fullcalendar/react         latest = 7.0.2
@fullcalendar/interaction   latest = 6.1.21     7.x line stops at 7.0.0-rc.0
@fullcalendar/timegrid      latest = 6.1.21     7.x line stops at 7.0.0-rc.0
@fullcalendar/daygrid       latest = 6.1.21     7.x line stops at 7.0.0-rc.0
@fullcalendar/list          latest = 6.1.21     7.x line stops at 7.0.0-rc.0
@fullcalendar/multimonth    latest = 6.1.21     7.x line stops at 7.0.0-rc.0
```

`@fullcalendar/core@7.0.2` calls itself "FullCalendar core types package" and peers on
`@full-ui/headless-calendar@7.0.2` and `temporal-polyfill@^1.0.1`. `@fullcalendar/react@7.0.2`
ships the former plugins as subpath entrypoints (`timegrid.js`, `daygrid.js`,
`interaction.js`, `list.js`, `multimonth.js`), plus `skeleton.css` and five themes.

Re-check with:

```bash
npm view @fullcalendar/timegrid version
npm view @fullcalendar/timegrid versions --json | grep '"7\.'
```

The pin lifts when the first command prints a 7.

## Governing specs

### `agent-os/specs/2026-08-12-1316-security-hardening-and-standard/`

- **Relationship:** Extends.
- **Relevant decision:** decision 5, "Dependabot, not CI" — "The gap is dependency drift, which
  Dependabot closes directly." Still true and unchanged. This spec adds the first deliberate
  exception: one package family where Dependabot's output is not actionable, because the
  upgrade is a repackaging rather than a version change. The exception is bounded by a trigger
  precisely so it does not quietly become the general policy.

### `agent-os/specs/2026-08-27-0736-pull-request-ci/`

- **Relationship:** Extends. Frozen 2026-08-27.
- **Relevant decisions:** CI runs on `pull_request` only, and it is what produced the evidence
  here — PR #5's red check, and before it the `npm ci` refusal on PR #3 that proved the five
  packages cannot move separately. Its Task 6 results table already records both.
- **Also carried forward:** the `fullcalendar` group added to `.github/dependabot.yml` in
  `aed4d96`. That commit and this spec are two halves of the same answer: the group makes a
  future 6→7 arrive as one PR, and the `ignore` stops it arriving until it can succeed.

### `agent-os/specs/2026-07-28-1234-weekly-schedule/`

- **Relationship:** Neither — cited as the governing choice this spec preserves.
- **Relevant decision:** decision 1, FullCalendar Standard v6 (MIT) over a hand-rolled week
  grid, Premium explicitly rejected. Nothing here disturbs it.

### `agent-os/specs/2026-08-06-1506-right-click-completion/`

- **Relationship:** Neither — cited as a constraint on the deferred migration.
- **Relevant decision:** decision 11 — the calendar context menu resolves its target by
  hit-testing a point with `document.elementsFromPoint`, because FullCalendar overlays two
  tables and neither is an ancestor of the other. That reasoning is written against v6's DOM.
  v7 rewrote the rendering, so this is the first thing to re-verify whenever the migration
  happens, and it is not something a typechecker will flag.

### `agent-os/specs/2026-07-28-2144-weekly-planning-wizard/`

- **Relationship:** Neither — cited as affected surface.
- **Relevant fact:** the external drag source is FullCalendar's `Draggable`
  (`src/components/schedule/ProjectsRail.tsx`, and the same pattern in
  `ScheduleBlocksStep.tsx`). `Draggable` survives into v7, re-exported from
  `@fullcalendar/react/interaction`.

## Affected code

### The four FullCalendar consumers

- **Location:** `src/components/schedule/WeekCalendar.tsx`,
  `src/components/schedule/TimeChartEditorView.tsx`,
  `src/components/schedule/ProjectsRail.tsx`,
  `src/components/planning/ScheduleBlocksStep.tsx`
- **Relevance:** the migration surface. The two rail files use only `Draggable`; the two
  calendar files carry every callback, the ref, and the colour handling.
- **Key patterns:** both calendar files compute `textColor: contrastText(e.backgroundColor)`
  when building events, and read `event.textColor` / `event.backgroundColor` back inside
  `eventContent`. v7 replaces that round trip with `color` + `contrastColor`.

### `src/app/globals.css`, lines 329–516

- **Relevance:** the expensive, invisible part. About 185 lines of `--fc-*` custom properties
  and `.fc-*` selectors, including light and dark palettes, `.schedule-calendar` overrides and
  `.time-chart-editor .fc-timechart-area`. v7's themes system replaces the mechanism these
  target.
- **What not to assume:** that a passing typecheck means the calendar looks right. It does not
  reach this file at all.

### `src/lib/schedule/geometry.ts` — `contrastText`

- **Relevance:** three call sites across the two calendar components, plus unit tests in
  `geometry.test.ts` and two explanatory comments in `globals.css`. v7's `contrastColor`
  computes the same thing natively; retiring it is part of the migration, not of this spec.
