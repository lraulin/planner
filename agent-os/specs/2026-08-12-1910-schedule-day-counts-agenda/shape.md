# Schedule Day Counts & Agenda View — Shaping Notes

**Status: active**  
Authoritative detail: `plan.md` (including **Changes from original plan**).

## Scope

Two things, both on `/schedule`:

1. **A selectable day count** — Achieve's 1 / 3 / 5 / 7 / 10 / 20 day widths, replacing the
   hardcoded Sunday-aligned week, plus a choice of how the range is anchored.
2. **An agenda view mode** — the same range as a `DataGrid` of appointment occurrences,
   with a **Days left** column.

### In scope

- `dayCount` (1, 3, 5, 7, 10, 20), `anchorMode` (rolling / aligned) and `viewMode`
  (calendar / agenda) stored in the existing `schedule` settings scope
- A pure, tested range function that both the server loader and FullCalendar read from
- `loadSchedule` taking an arbitrary range instead of a week
- A canonical Google mirror window that does not move when the day count does
- Day-count and anchor-mode entries on the calendar's context menu, registered as commands
- `?start=` as the URL anchor, with `?week=` still accepted
- The compact (phone) single-day pager generalized from "index into the week" to "index
  into the range"

### Out of scope

- Month and year views. Google Calendar has them; Achieve did not, and neither answers a
  question the 20-day view does not.
- Agenda rows for deadline-bearing tasks and projects. Considered and deferred — "days
  left" means something different for a deadline than for an event start, and mixing them
  needs a row-kind column and a mixed sort order. Appointments only for now.
- Integrating a FullCalendar "Day view" as a separate module. Explicitly set aside by the
  user at shaping time: this is one calendar that can be one day wide, not a second page.
- Window-aware Google sync staleness. `syncIsStale` records no window, so navigating months
  away inside the five-minute freshness window shows an unsynced range. That is
  **pre-existing**; this work only ensures the day count cannot make it worse.
- A "show weekends" option distinct from Work Week Mode. Achieve's Work Week Mode already
  is that switch.

## Decisions

- **Full Achieve parity on the day-count list.** All six widths, all rendered as time
  grids. 10 and 20 columns are dense, but that is what Achieve shipped and the project's
  standing goal is parity; a narrower list would be reading the UI instead of the intent.
- **Rolling from today is the default anchor, and this is a deliberate divergence.**
  Achieve's docs describe width plus navigation and never state an anchor rule for the
  non-7 widths. The user's reasoning decided it: _"Why do I need to see my schedule for the
  past?"_ Aligned mode remains available, and aligned + 7 reproduces the current view
  exactly, so nothing is lost.
- **Aligned steps by a week, rolling steps by the day count.** Anything else lets the
  aligned mode drift off the week boundary that defines it.
- **Aligned + 5 + Work Week Mode is Achieve's Mon–Fri work week.** This is why alignment is
  to the week rather than to an arbitrary N-day period grid — there is no such thing as a
  "3-day boundary" in a calendar.
- **The range is computed in `lib`, not by FullCalendar.** FullCalendar has a `dayCount`
  view option that would do the visible-column arithmetic including hidden weekends, but
  the server has to load exactly the same window, and two implementations of "which days am
  I looking at" is one too many. The lib function is the single answer; FullCalendar is
  handed a `visibleRange`.
- **Day count, anchor mode and view mode are settings, not URL state.** Per
  `2026-07-31-1520-persistent-ui-state`, the URL carries location — here, the anchor date.
  A width you re-pick every visit is one you stop using, which is the same argument that
  put slot size and Work Week Mode in this scope.
- **The Google mirror window is canonicalized** (whole weeks covering the range, 28-day
  minimum) rather than following the visible range. Freshness is time-based only, so a
  window that shrinks with the day count would report "fresh" over days it never fetched.
- **Agenda is a mode of the schedule tab, not a module.** It renders data already loaded
  for the calendar. A separate tab would need its own range, and then two surfaces would
  disagree about what "this range" means.

## Context

- **Visuals:** None provided.
- **References:** See `references.md`.
- **Product alignment:** Achieve parity is the standing product goal; the two divergences
  above (rolling default, agenda view) are recorded as intentional.

## Standards Applied

- `development/dates` — the range is built from local midnights and `setDate`, never from
  millisecond arithmetic; `localDateKey` for "today", `toDateKey` for stored calendar days.
- `development/testing` — the range math and the agenda row builder are pure `lib` modules
  with tests beside them; the widened `loadSchedule` range needs integration coverage; no
  React component tests.
- `components/data-grid` — the agenda reuses the one shared `DataGrid`; the Calendar |
  Agenda control is a lens control and belongs on the lens row, not with the commands.
- `components/navigation` — the day-count entries are `Command`s, so they reach the menu
  bar, `⌘K` and the `⋯` sheet, not just the right-click menu.
- `components/responsive` — the compact layout keeps rendering one day; the day count is a
  desktop-width choice and must not strand the phone on a 20-column grid.
