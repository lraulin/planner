# Deep links for the four remaining kinds — Shaping Notes

**Status: frozen / complete** (2026-08-18)

## Scope

Give Appointments, Metrics, Timeline, and Commitments a `?detail=` so Find can open
them, and so a pasted URL reopens the same record.

### Out of scope

- Fetching an appointment that is not in the loaded range (Find always sends `?start=`
  on the appointment's day). A bare `?detail=` on the wrong week will not open.
- Writing `?detail=` on every Timeline or Commitments row click (in-place editors, not
  drawers).
- Day view / planning-wizard appointment drawers.
- A new URL param. `?select=` stays Outline-only.
- Saving searches (the other Advanced Find follow-up).

## Decisions

- Reuse `?detail=` and `useViewStateUrl`. One param, four more consumers.
- Drawer pages (Appointments, Metrics) are two-way: open writes, close clears, Back
  closes.
- In-place pages (Timeline, Commitments) treat the param as a landing instruction.
- Fix Find's appointment day param from `?date=` (ignored) to `?start=` (what the
  calendar reads).
- Timeline prefixes the record id (`event:<id>`) only inside the view.
- Commitments shares one param across two grids; lookup decides which is focused.

## Context

- **Visuals:** None. The existing Contacts / Register `?detail=` behaviour is the
  reference.
- **References:** Advanced Find follow-up; ContactsView; useGridTab; ScheduleRangePage
  `?start=`; Timeline row ids in `chronology.ts`.
- **Product alignment:** Persistent UI state already requires drawers to be URL-backed.
  This finishes the four that were left in component state.

## Standards Applied

- `components/drawer-pattern` — open/close is one action; Back is close.
- `components/navigation` — a command that says Open must open.
- `development/testing` — pure mapping in `targets.ts`; no component tests.
- `development/clean-code` — one `?detail=` mechanism, not a fourth param.
- `development/commits` — one logical change, Spec trailer.
