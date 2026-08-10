# Google Calendar Event Colors — Shaping Notes

**Status: frozen / complete** (2026-08-10)

## Scope

Include Google Calendar **event colours** (`colorId`) in the existing Google Calendar
mirror and write-through path, and surface them on the week grid and appointment drawer.

### In scope

- Store `colorId` on mirrored appointments
- Resolve Google's 11-colour event palette for display
- Fill week-grid blocks with event colour when set; keep calendar colour as left edge
- Colour picker in the appointment drawer (default + 11 swatches)
- Write-through create/patch of `colorId` (including clear → calendar default)

### Out of scope

- Day tab appointment list colour chips
- Custom / freeform hex colours
- Editing calendar-level colours (already synced for display only)
- Series master colour UI (instances only, consistent with other Google fields)

## Decisions

- **Tinted fill + calendar edge** (not left-edge-only, not always fill with calendar colour)
- **Pull + set** — not pull-only
- Hardcoded palette rather than `GET /colors` per sync — Google's event palette is stable
- `colorId` is Google-owned; planner annotations stay untouched by the mirror

## Context

- **Visuals:** None
- **References:** Frozen google-calendar-sync spec; `mapping.ts`, `writeThrough.ts`,
  `WeekCalendar.tsx`, `AppointmentDrawer.tsx`
- **Product alignment:** Roadmap §Google integration — calendar sync already shipped;
  this is a fidelity delta on that surface

## Standards Applied

- database/migrations — generate sql + snapshot + journal
- development/testing — pure lib tests; no component tests
- development/clean-code — logic in `src/lib/**`
- components/drawer-pattern — stay-open Save, dirty tracking
