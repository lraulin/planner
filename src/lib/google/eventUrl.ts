/**
 * Google Calendar's public event URL. The `eid` is url-safe base64 of
 * `{eventId} {calendarId}` — the same shape as the `htmlLink` Google returns on events.
 *
 * For a series, pass `recurringEventId` (our `externalSeriesId`) so the link opens the
 * series rather than one expanded instance.
 */
export function googleCalendarEventUrl(eventId: string, calendarId: string): string {
  const eid = btoa(`${eventId} ${calendarId}`)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `https://calendar.google.com/calendar/event?eid=${eid}`;
}
