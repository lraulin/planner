/**
 * The three ways a Google call fails, as classes a caller can tell apart.
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
