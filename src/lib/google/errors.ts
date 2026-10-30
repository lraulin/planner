/**
 * The ways a Google call fails, as classes a caller can tell apart.
 *
 * Kept free of imports so code that only needs to *classify* a failure — the agent error
 * mapper above all — can do so without pulling the database and auth modules in with the
 * client.
 */

/**
 * Google is not connected, or the grant was revoked. Distinct from a transient failure
 * because the fix is different: the user has to reconnect, and no amount of retrying helps.
 */
export class GoogleNotLinkedError extends Error {
  constructor(message = "Google is not connected.") {
    super(message);
    this.name = "GoogleNotLinkedError";
  }
}

/**
 * Google returned 404/410 — the addressed thing is gone. Usually an event someone already
 * deleted elsewhere, which `deleteEvent` tolerates; but the same status also means "no such
 * calendar", so the default wording stays resource-neutral. A banner reading "this event no
 * longer exists" when the real problem is a missing calendar sends you looking in the wrong
 * place.
 */
export class GoogleEventGoneError extends Error {
  constructor(message = "That Google Calendar item no longer exists.") {
    super(message);
    this.name = "GoogleEventGoneError";
  }
}

/** Anything else: rate limits, 5xx, network. Transient — keep the mirror as it is. */
export class GoogleApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "GoogleApiError";
    this.status = status;
  }
}

/**
 * An edit to a whole series that would also move it to another day.
 *
 * Editing a series from one of its occurrences keeps the series' own first date and
 * applies only the time and the other fields (Google Calendar's "All events"). Google's UI
 * does not offer "All events" for a date change at all — only "This event" or "This and
 * following events" — and a PATCH carrying the new date would silently re-anchor the series
 * there, dropping every earlier occurrence. So the planner refuses rather than guess.
 */
export class SeriesDateChangeError extends Error {
  constructor(
    message = "This is one occurrence of a repeating Google Calendar event, and saving edits the whole series, which cannot move to another date. Keep the date and change only the time, drag the occurrence on the week grid to move just that one, or change the series' days in Google Calendar.",
  ) {
    super(message);
    this.name = "SeriesDateChangeError";
  }
}
