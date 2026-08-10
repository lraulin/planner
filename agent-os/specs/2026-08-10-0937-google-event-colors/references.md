# References for Google Calendar Event Colors

## Parent feature

### Google Calendar Sync (frozen)

- **Location:** `agent-os/specs/2026-07-31-2046-google-calendar-sync/`
- **Relevance:** Field ownership (Google vs planner annotations), mirror + write-through
  model, calendar colour on `google_calendar_links`, week-grid left-edge cue.
- **Key patterns:** `GoogleOwnedFields` excludes planner columns; etag skip; instance-only
  local rows for recurrence.

## Code

### Event mapping

- **Location:** `src/lib/google/mapping.ts`, `mapping.test.ts`
- **Relevance:** Extend `GoogleEvent` / `GoogleOwnedFields` / write body with `colorId`.

### Write-through

- **Location:** `src/lib/google/writeThrough.ts`, `src/lib/schedule/mutations.ts`
- **Relevance:** `pushableFrom` + `appointmentToGoogleEvent` must include `colorId` on
  create/patch.

### Display

- **Location:** `src/components/schedule/WeekCalendar.tsx`, `src/lib/schedule/queries.ts`
- **Relevance:** `calendarColor` already joined; add resolved `eventColor` hex for fill.

### Drawer

- **Location:** `src/components/schedule/AppointmentDrawer.tsx`, `src/app/schedule/actions.ts`
- **Relevance:** Form state + payload for new Google-owned field.

### Existing calendar colour UI

- **Location:** `src/components/settings/GoogleCalendarPanel.tsx`
- **Relevance:** Swatch styling precedent for a colour chip (calendar list).
