# Google Calendar Event Colors

**Status: frozen / complete** (2026-08-10)  
Spec folder: `agent-os/specs/2026-08-10-0937-google-event-colors/`

Delta on frozen `agent-os/specs/2026-07-31-2046-google-calendar-sync/`. That folder stays
frozen; this slice owns event-level colours.

## Context

Google Calendar sync already mirrored **calendar** colours
(`google_calendar_links.backgroundColor`) and painted them as a thick left edge on the week
grid. Individual events can also have a **per-event colour** (`colorId` `"1"`–`"11"`). Those
were ignored — every Google event looked like its calendar only.

This slice:

1. **Pulls** Google's event colours into the mirror and shows them on `/schedule`.
2. **Lets you set** a colour in the appointment drawer and write-through to Google.

## Decisions (as-built)

| Decision         | Choice                                                                                                                                                               |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Storage**      | Nullable `appointments.color_id` — Google's id `"1"`–`"11"`, null = calendar default                                                                                 |
| **Ownership**    | Google-owned (mirror + write-through), same family as `subject` / `showAs`                                                                                           |
| **Palette**      | Hardcoded in `src/lib/google/eventColors.ts` (stable; no `colors.get` on the critical path)                                                                          |
| **Display**      | Event colour fills the block when set (open check); calendar colour remains the thick left edge. No event colour → white fill + calendar edge. Done/missed grey out. |
| **Drawer**       | Default swatch + 11 palette swatches; label under the row                                                                                                            |
| **Write clear**  | Always send `colorId` on write; empty string clears to calendar default (omitting on PATCH would leave a prior colour)                                               |
| **Out of scope** | Day-tab list chips; custom hex; calendar colour editing; series-wide colour UI                                                                                       |

## Acceptance criteria

- [x] Events with a Google `colorId` render with that colour as the block fill on `/schedule` (open check state)
- [x] Events without `colorId` keep white fill + calendar left edge
- [x] Mirror upsert writes `colorId` and does not clobber planner annotations
- [x] Changing colour in the drawer persists locally and patches Google for google-origin rows
- [x] Choosing “default” clears `colorId` so the next mirror/UI uses calendar colour
- [x] Pure mapping/palette tests cover read, write, clear, and unknown ids

## Code map

| Concern | Path                                                                                    |
| ------- | --------------------------------------------------------------------------------------- |
| Schema  | `appointments.colorId` + `drizzle/0032_famous_black_bird.sql`                           |
| Palette | `src/lib/google/eventColors.ts`                                                         |
| Mapping | `src/lib/google/mapping.ts` (`GoogleOwnedFields.colorId`, write `colorId: ""` to clear) |
| Load    | `src/lib/schedule/queries.ts` → `ScheduleOccurrence.eventColor`                         |
| Grid    | `src/components/schedule/WeekCalendar.tsx`                                              |
| Drawer  | `src/components/schedule/AppointmentDrawer.tsx`                                         |

## Changes from original plan

| #   | Change                                                                               | Why                                                                                         |
| --- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| 1   | Thick left-edge class stays calendar-colour-only (not when only event colour is set) | A local appointment with a palette colour should fill without looking multi-calendar Google |
| 2   | Mirror updates when etag matches but local `colorId` differs                         | Rows mirrored before `color_id` never backfilled; etag-only skip left them white forever    |
| 3   | Fill uses event colour, else calendar colour (not white)                             | Matches Google Calendar defaults; white only for uncoloured planner-native rows             |

## Follow-ups (new work — not amendments to this frozen spec)

- Day tab list colour chips
- Agent tool arg for `colorId` on create/update appointment

---

Tasks 1–7 complete. Further colour work opens a new delta-spec.
