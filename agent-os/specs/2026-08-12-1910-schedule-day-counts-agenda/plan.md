# Schedule day counts + agenda view

**Status: active**  
Spec folder: `agent-os/specs/2026-08-12-1910-schedule-day-counts-agenda/`

## Context

`/schedule` renders exactly one thing: a Sunday-aligned 7-day FullCalendar time grid. The
only single-day rendering is the responsive fallback below `md` (`singleDay` +
`dayOffset` in `ScheduleView`), which is a layout accident, not a view you can choose.

Achieve Planner's Weekly Schedule offers **1, 3, 5, 7, 10, 20 day** widths from its View
menu (`docs/achieve-planner/online-help.md:1634-1653`), and the frozen base spec
`agent-os/specs/2026-07-28-1234-weekly-schedule/plan.md:192` explicitly put "Month/day
primary views" out of scope. This is the delta that supersedes that one line.

Two things beyond straight parity, decided during shaping:

1. **Anchoring.** Achieve's docs never state how a 3/10/20-day window is anchored — they
   only document width plus prev/next/Go-to-Date. A schedule that always starts on today
   is more useful than one that starts on last Sunday ("why do I need to see my schedule
   for the past?"), so **rolling-from-today becomes the default**, with a stored toggle
   back to calendar-week alignment for a conventional Sun–Sat week.
2. **Agenda mode.** Achieve has no appointments grid at all (`docs/achieve-planner/grid-columns.md`
   lists every grid tab; there is none). Google Calendar's "Schedule" view is the model:
   the same range, listed as rows instead of drawn as blocks, with a **Days left** column.
   Planner already has a generic `DataGrid` used by non-node modules (Notes, Contacts,
   Finances), so this is a second rendering of data already loaded, not a new module.

Deliberate divergence from Achieve, to be recorded in the spec: the rolling anchor default
and the agenda view are Planner additions.

## Spec relationships

- **Extends:** `agent-os/specs/2026-07-28-1234-weekly-schedule/`
- **Supersedes:** `agent-os/specs/2026-07-28-1234-weekly-schedule/` — the out-of-scope line
  "Month/day primary views (week is the product surface)". Week remains the _default_; it
  is no longer the only width.
- **Extends:** `agent-os/specs/2026-08-06-1506-right-click-completion/` — day count joins
  slot size and Work Week Mode on the calendar's own menu, registered as `Command`s.
- **Extends:** `agent-os/specs/2026-07-31-1520-persistent-ui-state/` — day count, anchor
  mode and view mode are stored settings, not URL state.
- **Touches (active):** `agent-os/specs/2026-07-31-1938-responsive-mobile/` — the compact
  `dayOffset` pager stays, generalized from "index into the week" to "index into the range".
- **Touches:** `agent-os/specs/2026-07-31-2046-google-calendar-sync/` — the mirror window
  is no longer the visible week; see the canonical-window decision below.

## Decisions

| Decision                                                                                                        | Rationale                                                                                                                                       |
| --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Day counts **1, 3, 5, 7, 10, 20** — the whole Achieve list, all as time grids                                   | Full parity; 10/20 are dense but that is what AP shipped                                                                                        |
| Default **7**, default anchor **rolling**                                                                       | 7 keeps today's look; rolling is the point of the change                                                                                        |
| Rolling = range starts on the anchor date; prev/next steps by `dayCount`                                        | "Today" is always the left-hand column unless you navigate                                                                                      |
| Aligned = range starts at the start of the week containing the anchor; prev/next steps by 7                     | Aligned+7 is exactly today's behaviour; aligned+5 with Work Week Mode is AP's Mon–Fri work week                                                 |
| `dayCount`, `anchorMode`, `viewMode` live in the **`schedule` settings scope**                                  | Matches `slotMinutes`/`workWeek`; per persistent-ui-state, URL carries location only                                                            |
| URL carries the **anchor date only**, as `?start=YYYY-MM-DD` (`?week=` accepted as a deprecated alias)          | `week` stops being true once the range can be 3 or 20 days                                                                                      |
| Range math is a **pure lib function with tests**, not FullCalendar's `dayCount` option                          | Server and client must agree on the exact window; work-week skipping makes "N visible columns" non-trivial                                      |
| Google mirror syncs a **canonical window** (whole weeks covering the range, min 28 days), not the visible range | Staleness is time-based only (`syncIsStale`); if the window followed the day count, flipping 1→20 within 5 min would leave days 2–20 unmirrored |
| Agenda is a **third view mode on `/schedule`**, over the same loaded range                                      | One tab, one load; no second place to disagree about what "this range" means                                                                    |
| Agenda rows are **appointment occurrences only**                                                                | Days left = days until the event. Mixing in deadline-bearing tasks is a separate idea                                                           |
| Compact (phone) keeps rendering one day via `dayOffset`, now indexing into the range                            | Preserves the active responsive-mobile decision without a second mechanism                                                                      |

## Acceptance criteria

- [ ] The calendar's right-click menu and the command palette both offer One / Three /
      Five / Seven / Ten / Twenty Days; the choice survives a reload.
- [ ] With rolling anchoring (default), the leftmost column is **today** on arrival at
      `/schedule`, at every day count.
- [ ] With aligned anchoring + 7 days, the view is byte-for-byte today's Sun–Sat week.
- [ ] Work Week Mode + 5 days shows **five** Mon–Fri columns, not five days minus weekends.
- [ ] Prev/next steps by the day count (rolling) or by a week (aligned); "Today" returns
      the anchor to today.
- [ ] Appointments, recurrence expansions and Google-mirrored events all appear across the
      **whole** range, at 20 days as well as 7.
- [ ] Switching day count 1 ↔ 20 twice inside five minutes never shows an empty tail of
      unmirrored Google days.
- [ ] A Calendar | Agenda toggle switches the same range to a grid with Date, Time,
      Subject, Project, Status and **Days left**; sorting and Show Fields work; the mode
      survives a reload.
- [ ] Clicking an agenda row opens the same appointment drawer the calendar opens.
- [ ] `npm run test:unit`, `npm run lint`, `npm run typecheck`, `npm run build` and
      `npm run smoke` all pass; the DB integration tests actually ran (no skip warning).

## Changes from original plan

| #   | Change                      | Why |
| --- | --------------------------- | --- |
|     | _(filled during implement)_ |     |

---

## Task 1: Save spec documentation

Create `agent-os/specs/2026-08-12-1910-schedule-day-counts-agenda/` with `plan.md` (this
document, **Status: active**, including the empty _Changes from original plan_ table),
`shape.md`, `standards.md`, `references.md`. No `visuals/` — none were provided.

`references.md` records the Achieve citations above plus the code references:
`src/components/schedule/{ScheduleView,WeekCalendar,MiniMonth}.tsx`,
`src/lib/schedule/{queries,geometry,recurrence}.ts`, `src/lib/settings/schedule.ts`,
`src/components/notes/{NotesGrid,notesColumns}.tsx` (the pattern for a non-node
`DataGrid` host).

Standards to pull into `standards.md`: `development/dates`, `components/data-grid`,
`development/testing`, and whatever `agent-os/standards/index.yml` lists for settings and
commands.

## Task 2: Range math (`src/lib/schedule/range.ts` + `range.test.ts`)

The one piece of tricky reasoning, so it lives in `lib` with a test beside it per
`CLAUDE.md`.

```ts
export const DAY_COUNTS = [1, 3, 5, 7, 10, 20] as const;
export type DayCount = (typeof DAY_COUNTS)[number];
export type AnchorMode = "rolling" | "aligned";

export type ScheduleRange = {
  /** Local midnight of the first visible day. */
  start: Date;
  /** Exclusive; extends past hidden weekend days so `days.length === dayCount`. */
  end: Date;
  /** The visible day columns, in order. */
  days: Date[];
};

export function scheduleRange(
  anchor: Date,
  opts: { dayCount: DayCount; anchorMode: AnchorMode; workWeek: boolean; weekStartsOn?: number },
): ScheduleRange;

/** Prev/next: by `dayCount` when rolling, by 7 when aligned. */
export function stepAnchor(anchor: Date, direction: -1 | 1, opts: {...}): Date;
```

Build on `startOfWeek`, `WEEKDAYS_ONLY` and the local-midnight conventions in
`src/lib/schedule/geometry.ts`; do not add a date library (the codebase has none, by
decision). Work-week skipping is what makes this non-obvious: with `workWeek: true` the
loop advances past Saturday and Sunday, so `end - start` can exceed `dayCount` days.

Tests that would fail on a plausible mistake:

- rolling: `days[0]` is the anchor at every day count.
- aligned + 7 + `weekStartsOn: 0`: identical to `weekDays(startOfWeek(anchor, 0))`.
- `workWeek: true` at counts 1/3/5/7/10/20: `days.length === dayCount` and no `getDay()`
  of 0 or 6 anywhere.
- `stepAnchor` forward then back returns the original anchor in both modes.
- a range crossing a DST boundary still yields `dayCount` distinct local calendar days
  (the `setDate` + local-midnight idiom, not `+ n * 86_400_000`).

## Task 3: Settings (`src/lib/settings/schedule.ts`)

Add to `ScheduleViewSettings`, additively, following the existing membership-checked
`slotMinutes` idiom:

```ts
dayCount: DayCount; // default 7
anchorMode: AnchorMode; // default "rolling"
viewMode: "calendar" | "agenda"; // default "calendar"
```

`parseScheduleView` falls back to the defaults for missing/invalid keys. Note in the file
comment that `anchorMode: "rolling"` **is** a default that changes what an existing stored
payload renders — that is intended here (it is the feature), and the file's existing
"a default that changes what existing users see is a migration" comment should say so
rather than be silently contradicted. Extend the existing `schedule.test.ts` parse tests
(or add one) for the three new keys, including junk values.

`SETTINGS_VERSION` does not move: this is additive, and old payloads parse correctly.

## Task 4: Server — load a range, sync a canonical window

**`src/lib/schedule/queries.ts`** — replace `loadSchedule`'s `{ weekStart, weekStartsOn }`
with `{ rangeStart, rangeEnd }`; rename `SchedulePayload.weekStart` → `rangeStart` and add
`rangeEnd`. `listAppointmentsInRange` and `expandRecurrence` already take a range and need
no change.

`expandTimeChartAreas(areas, weekStart)` in `src/lib/schedule/recurrence.ts` hardcodes
`for (let i = 0; i < 7; i++)`. Change it to take the `days: Date[]` from `scheduleRange`
and emit one background block per visible day. Update its unit tests.

**Sync window.** Add `syncWindowFor(range): MirrorWindow` — expand the range outward to
whole weeks and to a 28-day minimum — and use it for both `syncWindow` and the stale check
in `loadSchedule`. This keeps the mirror window independent of the day count, so
`planMirror`'s in-window delete predicate stays honest and `syncIsStale`'s time-only
freshness stays sound across a width change. `syncGoogleAction(weekStartIso)` becomes
`syncGoogleAction(anchorIso, ...)` deriving the same canonical window.

> Pre-existing and **out of scope**: navigating months away inside the 5-minute freshness
> window shows an unsynced range, because `syncIsStale` (`src/lib/google/queries.ts:66`)
> records no window. Note it as a follow-up in the frozen spec.

**`src/app/schedule/page.tsx`** — read the stored settings server-side with
`loadUserSettings(userId)` + `parseScheduleView`, take the anchor from `?start=`
(falling back to `?week=`, then today), compute the range with `scheduleRange`, and pass
`rangeStart`/`days` down. Wrap `loadUserSettings` in React `cache()` so the root layout and
this page share one round trip.

Update the other `loadSchedule` callers to pass an explicit range — `src/app/day/page.tsx`
(one day), `src/lib/planning/queries.ts`, `src/lib/agent/{scheduleTools,outlineTools}.ts`
(keep their week semantics by computing a 7-day range at the call site).

Integration coverage: extend `src/lib/schedule/mutations.integration.test.ts` for a
multi-day range (an appointment on day 18 of a 20-day range is returned; one on day 21 is
not), and keep the cross-user check in `src/lib/db/crossUserReads.integration.test.ts`
passing against the new signature. Confirm these actually ran — Postgres up, no skip
warning.

## Task 5: Calendar rendering, toolbar and URL

**`src/components/schedule/WeekCalendar.tsx`** — replace the `weekStart`/`singleDay` props
with `days: Date[]` (plus `rangeStart`/`rangeEnd`). Render a custom FullCalendar view with
an explicit `visibleRange` rather than `timeGridWeek`/`timeGridDay`:

```tsx
initialView="plannerRange"
views={{ plannerRange: { type: "timeGrid" } }}
visibleRange={{ start: rangeStart, end: rangeEnd }}
weekends={weekends}
key={`${rangeStart.toISOString()}:${days.length}:${slotDuration}:${weekends}`}
```

Everything else (background events, `eventContent`, the `contextmenu` hit-test in
`calendarTargetFrom`, drag/resize/drop) is range-agnostic and stays. At 10/20 days check
the day header format still fits — `dayHeaderFormat` may need to shorten past 7 columns.

**`src/components/schedule/ScheduleView.tsx`**

- Day-count items on the calendar's context menu, built from `DAY_COUNTS.map(...)`
  exactly as `SLOT_MINUTES` already is, plus an "Start on today" (anchor mode) toggle
  beside Work Week Mode. Register them as `Command`s so they reach `⌘K` and the menu bar
  — decision 4 of the right-click-completion spec.
- Patch the setting, then `router.refresh()`: the day count changes the server's data
  window, unlike slot size.
- Pager: `stepAnchor` instead of `± 7`; label reads `days[0] – days[at end]` (or a single
  date at count 1). Keep `schedule.today` resetting the anchor to today.
- `navigateWeek` → `navigateTo(date)` pushing `/schedule?start=…`. Update the other
  `/schedule?week=` builders: `MiniMonth` selection, `?block=` cleanup, the time-chart
  `returnTo`, `src/components/planning/WeeklyPlanView.tsx` (3 sites),
  `src/components/day/AppointmentsPane.tsx:52`. `page.tsx` keeps reading `?week=` so old
  links resolve (aligned to the week, its original meaning).
- Compact: `dayOffset` now indexes into `range.days` with `next >= 0 && next < days.length`
  instead of the hardcoded `0..6`, and stepping off either end moves the anchor by the
  range length.

## Task 6: Agenda mode

**`src/lib/schedule/agenda.ts` + `agenda.test.ts`** — `agendaRows(occurrences, todayKey)`
sorting by start (all-day rows first within a day) and deriving `daysLeft` with
`daysBetweenKeys` from `geometry.ts`. Negative for days already past (possible in aligned
mode); zero is today. Pure function, tested.

**`src/components/schedule/agendaColumns.tsx`** — `ColumnDef<AgendaColumnCtx, AgendaRow>[]`
modelled on `src/components/notes/notesColumns.tsx`: Date (via `DateText`, so the display
date-format setting applies), Time, Subject, Project, Status (reuse `checkStateMark` /
`checkStateLabel`), Days left (right-aligned; `useToday()` for the wall-clock day so
nothing flashes the wrong value during hydration).

**`src/components/schedule/AgendaGrid.tsx`** — a `DataGrid<AgendaColumnCtx, AgendaRow>`
host following `NotesGrid`: `useGridState` + `GridToolbar` for sort, search and Show
Fields, under a `gridScope("schedule.agenda")` settings key. Row click opens the existing
appointment drawer; the status cell cycles check state through the same optimistic handler
the calendar uses. `ScheduleView` renders `AgendaGrid` instead of `WeekCalendar` when
`view.viewMode === "agenda"`, with a Calendar | Agenda control on the lens row (a view
control, not a command — `agent-os/standards/components/data-grid.md`'s two-row rule).

No React component tests, per `CLAUDE.md`.

## Task 7: Verify, freeze spec, update roadmap

- `npm run test:unit` (check for the Postgres skip warning), `npm run lint`,
  `npm run typecheck`, `npm run build`.
- Dev server + **`npm run smoke`** — `/schedule` is a `"use server"`-adjacent route whose
  render nothing else exercises.
- Browser pass with the `run-planner` skill: each of the six day counts; rolling vs
  aligned; Work Week Mode at 5 days; drag/resize/external drop still work at 20 days;
  agenda toggle, sort, Days left; phone width still shows one day and pages correctly.
- Push to `master` — mobile behaviour changed, and it is validated on the deployed iPhone.
- Update `plan.md`/`shape.md` for as-built drift, complete _Changes from original plan_,
  mark both **Status: frozen / complete (YYYY-MM-DD)**, list follow-ups (window-aware sync
  staleness; agenda rows for deadline-bearing tasks) as new work.
- Update `agent-os/product/roadmap.md` if this closes a listed item.

---

> **Standing rule while this spec is active:** material changes to requirements, design or
> scope — including feedback on what was actually built — go into `plan.md`/`shape.md` and
> get a row in _Changes from original plan_. Pure implementation detail does not.
