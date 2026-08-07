/**
 * Thin Google Calendar API v3 client. The only impure part of `src/lib/google/` besides
 * `sync.ts`.
 *
 * Plain `fetch` rather than the `googleapis` package: we use five endpoints, and that
 * dependency is tens of megabytes of generated surface for the privilege. Token refresh is
 * Better Auth's job (`getAccessToken` below), which is the part that would actually have
 * been worth a library.
 */

import { headers } from "next/headers";
import { auth } from "@/lib/auth/server";
import type { GoogleEvent, GoogleEventWrite } from "./mapping";

const CALENDAR_API = "https://www.googleapis.com/calendar/v3";

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
 * A valid access token for this user, refreshing it if needed.
 *
 * Better Auth owns the refresh flow and the token columns on `accounts`; this feature
 * deliberately does not hand-roll either. A user who never linked Google has no account
 * row for the provider, which surfaces here as a throw rather than an empty string.
 */
export async function getGoogleAccessToken(userId: string): Promise<string> {
  try {
    // `headers()` throws outside a request scope (a script, a test). The user is already
    // identified by `userId`, so an absent header bag is not a problem worth failing on.
    let requestHeaders: Headers | undefined;
    try {
      requestHeaders = await headers();
    } catch {
      requestHeaders = undefined;
    }

    const result = await auth.api.getAccessToken({
      body: { providerId: "google", userId },
      ...(requestHeaders ? { headers: requestHeaders } : {}),
    });
    if (!result?.accessToken) throw new GoogleNotLinkedError();
    return result.accessToken;
  } catch (error) {
    if (error instanceof GoogleNotLinkedError) throw error;
    // Better Auth throws when there is no google account, and Google returns
    // `invalid_grant` once a user revokes access from their account settings. Both mean
    // the same thing to a caller: reconnect.
    throw new GoogleNotLinkedError(
      error instanceof Error && /invalid_grant/i.test(error.message)
        ? "Google access was revoked. Reconnect to resume syncing."
        : "Google is not connected.",
    );
  }
}

async function googleFetch(
  accessToken: string,
  path: string,
  init: RequestInit = {},
): Promise<unknown> {
  const response = await fetch(`${CALENDAR_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
    cache: "no-store",
  });

  if (response.ok) {
    // 204 on delete: nothing to parse.
    return response.status === 204 ? null : await response.json();
  }

  const body = await response.text();
  if (response.status === 401 || response.status === 403) {
    throw new GoogleNotLinkedError(
      "Google rejected the stored credentials. Reconnect to resume syncing.",
    );
  }
  if (response.status === 404 || response.status === 410) {
    // Name the calendar when the path identifies one, so a disabled or deleted calendar
    // reads as itself rather than as a mystery.
    const calendar = /\/calendars\/([^/?]+)/.exec(path)?.[1];
    throw new GoogleEventGoneError(
      calendar
        ? `Google Calendar "${decodeURIComponent(calendar)}" or the requested event no longer exists.`
        : undefined,
    );
  }
  throw new GoogleApiError(
    response.status,
    `Google Calendar API ${response.status}: ${body}`,
  );
}

export type GoogleCalendarListEntry = {
  id: string;
  summary: string;
  backgroundColor?: string;
  primary?: boolean;
  accessRole?: string;
  deleted?: boolean;
};

/** Every calendar in the user's list, including ones shared with them. */
export async function listCalendars(
  userId: string,
): Promise<GoogleCalendarListEntry[]> {
  const token = await getGoogleAccessToken(userId);
  const out: GoogleCalendarListEntry[] = [];
  let pageToken: string | undefined;

  do {
    const query = new URLSearchParams({ maxResults: "250", showDeleted: "false" });
    if (pageToken) query.set("pageToken", pageToken);
    const page = (await googleFetch(token, `/users/me/calendarList?${query}`)) as {
      items?: GoogleCalendarListEntry[];
      nextPageToken?: string;
    };
    out.push(...(page.items ?? []));
    pageToken = page.nextPageToken;
  } while (pageToken);

  return out;
}

/**
 * Events overlapping [timeMin, timeMax) on one calendar.
 *
 * `singleEvents=true` is the load-bearing parameter of this whole feature: Google expands
 * recurring series server-side and applies its own exceptions, overrides, and
 * cancellations. That is what lets us store plain instances and skip an RRULE parser, an
 * exception table, and EXDATE handling entirely.
 */
export async function listEvents(
  userId: string,
  calendarId: string,
  timeMin: Date,
  timeMax: Date,
): Promise<GoogleEvent[]> {
  const token = await getGoogleAccessToken(userId);
  const out: GoogleEvent[] = [];
  let pageToken: string | undefined;

  do {
    const query = new URLSearchParams({
      singleEvents: "true",
      showDeleted: "false",
      maxResults: "2500",
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      orderBy: "startTime",
    });
    if (pageToken) query.set("pageToken", pageToken);

    const page = (await googleFetch(
      token,
      `/calendars/${encodeURIComponent(calendarId)}/events?${query}`,
    )) as { items?: GoogleEvent[]; nextPageToken?: string };

    out.push(...(page.items ?? []));
    pageToken = page.nextPageToken;
  } while (pageToken);

  return out;
}

export async function insertEvent(
  userId: string,
  calendarId: string,
  body: GoogleEventWrite,
): Promise<GoogleEvent> {
  const token = await getGoogleAccessToken(userId);
  return (await googleFetch(
    token,
    `/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
  )) as GoogleEvent;
}

export async function patchEvent(
  userId: string,
  calendarId: string,
  eventId: string,
  body: Partial<GoogleEventWrite>,
): Promise<GoogleEvent> {
  const token = await getGoogleAccessToken(userId);
  return (await googleFetch(
    token,
    `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    { method: "PATCH", body: JSON.stringify(body) },
  )) as GoogleEvent;
}

/**
 * Delete one event. A 404/410 is swallowed: the goal is "not in Google", and an event
 * someone already removed on their phone satisfies that. Throwing would strand the local
 * row permanently undeletable.
 */
export async function deleteEvent(
  userId: string,
  calendarId: string,
  eventId: string,
): Promise<void> {
  const token = await getGoogleAccessToken(userId);
  try {
    await googleFetch(
      token,
      `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      { method: "DELETE" },
    );
  } catch (error) {
    if (error instanceof GoogleEventGoneError) return;
    throw error;
  }
}
