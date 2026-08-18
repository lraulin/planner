# Deep links for Appointments, Metrics, Timeline, and Commitments

**Status: frozen / complete** (2026-08-18)  
Spec folder: `agent-os/specs/2026-08-18-1254-detail-deep-links/`

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-18-1012-advanced-find/` — this is that spec's first
  follow-up: _"Deep links for the four remaining kinds."_
- **Extends:** `agent-os/specs/2026-07-31-1520-persistent-ui-state/` — `?detail=` is the
  addressable "this record is open" param; filters stay in `user_settings`.
- **Extends:** `agent-os/specs/2026-08-14-1142-view-in-outline/` — `?detail=` means the
  record is open; `?select=` stays Outline-only.

## Context

Advanced Find can already name every record. For most kinds, Open is a real deep link
(`?detail=`, a fitness route, or `?note=`). Four kinds only landed on their page, because
those views held the open record in component state:

| Kind                   | Page                    | What "open" means there                       |
| ---------------------- | ----------------------- | --------------------------------------------- |
| Appointment            | `/schedule/calendar`    | Appointment drawer                            |
| Metric                 | `/metrics`              | Metric drawer                                 |
| Life event             | `/library/timeline`     | The chronology row (edits in the grid)        |
| Recurring bill / spend | `/finances/commitments` | The row on the matching grid (edits in place) |

Find already reported `opens: false` and labelled the command **Show where it lives** so
it would not promise a drawer. This spec gives those four a `?detail=` so Open can mean
Open.

The work is useful without Find: a pasted `/metrics?detail=<id>` should reopen the drawer
the way Contacts and the Register already do.

## Decisions

1. **Same param, no new one.** `?detail=<id>` via `useViewStateUrl`. Contacts, Resources,
   Jobs, Residences, Register, and Accounts already consume it.
2. **Drawer pages are two-way bound.** Appointments and Metrics write `?detail=` on open
   and clear it on close (`push`, so Back closes). Draft appointments (no id yet) stay in
   component state; they are not a deep link.
3. **In-place pages consume `?detail=` as a landing.** Timeline and Commitments have no
   drawer. The param selects the row (and on Timeline, shows the grid rather than the
   ribbon). Clicking another row does not rewrite the URL — that would spam history for
   an inline edit. Reload of the landing URL still re-selects.
4. **The calendar's day param is `?start=`, not `?date=`.** Find currently writes
   `?date=`, which `ScheduleRangePage` ignores. Appointment hrefs become
   `/schedule/calendar?start=<day>&detail=<id>`.
5. **Timeline ids.** Find's `recordId` is the `life_events.id`. Grid rows are
   `event:<id>`. The URL carries the record id; the view prefixes.
6. **Commitments ids.** Bills and spend share one `?detail=` space. The view looks the
   id up in bills, then spend, focuses that grid, and selects the row.

## Acceptance criteria

- [x] Find **Open** on an appointment, metric, life event, bill, or spend actually opens
      the record (drawer or selected row). The command says **Open**, not **Show where it
      lives**.
- [x] `/metrics?detail=<id>` opens that metric's drawer. Close clears the param. Reload
      reopens it.
- [x] `/schedule/calendar?start=<day>&detail=<id>` lands on that day with the appointment
      drawer open. Opening an existing event from the calendar writes `?detail=`; closing
      clears it. A new draft does not write a param.
- [x] `/library/timeline?detail=<id>` shows the grid with that life event selected,
      even if the stored presentation is the ribbon.
- [x] `/finances/commitments?detail=<id>` selects the matching bill or spend row and
      focuses that grid.
- [x] `resultTarget` reports `opens: true` for all four kinds, and the appointment href
      uses `?start=` plus `?detail=`.
- [x] `npm test` (unit), lint, and typecheck pass. Browser-verified via the driver.

## Changes from original plan

| #   | Change                      | Why |
| --- | --------------------------- | --- |
|     | _(filled during implement)_ |     |

## Task 1: Save spec documentation

`plan.md`, `shape.md`, `standards.md`, `references.md`.

## Task 2: Find targets

`src/lib/find/targets.ts` + tests. All four kinds get a `?detail=` href and `opens: true`.
Appointment day param is `?start=`.

## Task 3: Metrics drawer

`MetricsView` treats `useViewStateUrl().detail` as the open metric. The drawer still
loads the record (parent-fetch, as today); the URL is what decides which id to load.

## Task 4: Appointment drawer

`ScheduleView` writes/reads `?detail=` for existing appointments. Drafts stay local.
Wrap the view in `Suspense` so `useSearchParams` is legal. Calendar day stays `?start=`.

## Task 5: Timeline landing

Consume `?detail=<eventId>`: switch to the grid and select `event:<id>`. Pin-click and
Find take the same path.

## Task 6: Commitments landing

Consume `?detail=<id>`: find the row in bills or spend, focus that grid, select it.
`DataGrid` already scrolls the focused row into view.

## Task 7: Verify, freeze spec

Unit tests, lint, typecheck, driver walk of the four landings plus Find Open.
Freeze when verified.

> While this spec is **active**, when we make a material change to requirements, design,
> or scope (including from feedback on what was implemented), update the relevant sections
> and append to **Changes from original plan**. Skip pure implementation details. Freeze
> when verified.
