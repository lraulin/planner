/**
 * Push local appointment changes straight to Google inside the mutation that made them.
 *
 * Google is the source of truth, so a local row is never left holding a change Google has
 * not accepted. The alternative — queue it and reconcile later — is the sync engine this
 * design deliberately does not build.
 *
 * Every function here is a no-op when Google is not set up (`pushTargetCalendarId` is
 * null). That gate is what keeps the planner fully usable as a local calendar, and is why
 * the existing schedule tests still pass untouched.
 */

import type { Appointment } from "@/db/schema";
import { daysBetweenKeys, shiftDateKey, zonedDateKey } from "@/lib/schedule/geometry";
import {
  deleteEvent,
  getEvent,
  GoogleEventGoneError,
  insertEvent,
  listEvents,
  patchEvent,
} from "./client";
import { SeriesDateChangeError } from "./errors";
import { findDuplicateEvent } from "./dedupe";
import {
  appointmentToGoogleEvent,
  type GoogleEvent,
  type GoogleEventTime,
  type GoogleEventWrite,
  type GoogleOwnedFields,
  writeEventTime,
  writeTimeZone,
} from "./mapping";
import { pushTargetCalendarId } from "./queries";

/**
 * Shown when a patch hits a Google event that was deleted elsewhere (404/410). Deliberately
 * does not delete the local row — planner-only fields (check state, priority, contexts,
 * project) would be lost on what may be a transient 404. The user refreshes to drop the
 * stale mirror.
 */
export const GOOGLE_EVENT_GONE_MESSAGE =
  "This event no longer exists in Google Calendar. Refresh the schedule to drop the stale row.";

/** The external columns a successful push writes back onto the local row. */
export type ExternalStamp = {
  externalSource: "google";
  externalId: string;
  externalSeriesId: string | null;
  externalCalendarId: string;
  externalEtag: string | null;
  externalUpdatedAt: Date | null;
};

function stampFrom(event: GoogleEvent, calendarId: string): ExternalStamp | null {
  if (!event.id) return null;
  const updated = event.updated ? new Date(event.updated) : null;
  return {
    externalSource: "google",
    externalId: event.id,
    externalSeriesId: event.recurringEventId ?? null,
    externalCalendarId: calendarId,
    externalEtag: event.etag ?? null,
    externalUpdatedAt: updated && !Number.isNaN(updated.getTime()) ? updated : null,
  };
}

/** The appointment shape the mapper needs — what a create builds before inserting. */
export type PushableAppointment = Parameters<typeof appointmentToGoogleEvent>[0];

export type CreateResult =
  | { pushed: false }
  | { pushed: true; recurring: false; stamp: ExternalStamp; existing: null }
  /**
   * The calendar already held this appointment (`findDuplicateEvent`), so nothing was
   * inserted. `existing` is that event's Google-owned columns: the caller stores *those*
   * rather than its own input, because Google is the source of truth for them.
   */
  | {
      pushed: true;
      recurring: false;
      stamp: ExternalStamp;
      existing: GoogleOwnedFields;
    }
  /**
   * A recurring create posts a *series*. Google owns its expansion, so there is no single
   * instance to stamp onto a local row — the caller runs a mirror pass and lets the
   * instances arrive as ordinary rows instead.
   */
  | { pushed: true; recurring: true; seriesId: string; calendarId: string };

/**
 * Create the event in Google. Returns what the caller should do with the result.
 *
 * A recurring appointment is posted with its RRULE and then deliberately *not* stored as a
 * local master: the local table holds only instances, so the series comes back through the
 * mirror. That is what stops a planner-created series from existing twice — once as our
 * master and once as Google's expansion.
 */
export async function pushCreate(
  userId: string,
  appointment: PushableAppointment,
): Promise<CreateResult> {
  const calendarId = await pushTargetCalendarId(userId);
  if (!calendarId) return { pushed: false };

  const body = appointmentToGoogleEvent(appointment);

  if (!body.recurrence?.length) {
    const existing = await findExistingEvent(userId, calendarId, appointment);
    if (existing) {
      return {
        pushed: true,
        recurring: false,
        stamp: {
          externalSource: "google",
          externalId: existing.externalId,
          externalSeriesId: existing.externalSeriesId,
          externalCalendarId: existing.externalCalendarId,
          externalEtag: existing.externalEtag,
          externalUpdatedAt: existing.externalUpdatedAt,
        },
        existing,
      };
    }
  }

  const event = await insertEvent(userId, calendarId, body);

  if (body.recurrence?.length) {
    if (!event.id) throw new Error("Google did not return an id for the new series.");
    return { pushed: true, recurring: true, seriesId: event.id, calendarId };
  }

  const stamp = stampFrom(event, calendarId);
  if (!stamp) throw new Error("Google did not return an id for the new event.");
  return { pushed: true, recurring: false, stamp, existing: null };
}

/**
 * The live event on the target calendar this create would duplicate, if any.
 *
 * Best-effort by design: a failed lookup falls through to the insert, which is exactly the
 * behaviour before this check existed. A Google that cannot list will usually refuse the
 * insert too, and that error is the one worth showing. A series is never checked: its
 * instances come back through the mirror, and matching one instance would not say the
 * whole series already exists.
 */
async function findExistingEvent(
  userId: string,
  calendarId: string,
  appointment: PushableAppointment,
): Promise<GoogleOwnedFields | null> {
  let events: GoogleEvent[];
  try {
    events = await listEvents(
      userId,
      calendarId,
      appointment.startAt,
      appointment.endAt,
    );
  } catch {
    return null;
  }
  return findDuplicateEvent(
    {
      subject: appointment.subject,
      startAt: appointment.startAt,
      endAt: appointment.endAt,
      allDay: appointment.allDay,
    },
    events,
    calendarId,
  );
}

/**
 * What a local edit of a Google event means.
 *
 * - `series` — the drawer's save and the connector's `update_appointment`. On an occurrence
 *   of a repeating event this is Google Calendar's **"All events"**: the series keeps its
 *   own first date and takes the occurrence's new time, duration, and other fields.
 * - `occurrence` — dragging in the week grid. On an occurrence this is Google's **"This
 *   event"**: only that one moves, and the rest of the series is untouched.
 *
 * For a one-off event the two are the same edit.
 */
export type EditScope = "series" | "occurrence";

/**
 * Which Google event a local edit targets, and the body to PATCH onto it.
 *
 * Split out of `pushUpdate` because this is the whole of the interesting reasoning and
 * none of the network: an instance id would edit one occurrence when the user meant the
 * series, and the recurrence field is conditional. Kept pure so its test needs neither a
 * Google token nor a mocked client — the standard's "prefer real values over mocks", and
 * the reason the unit suite has no `vi.mock` left to leak across a shared worker.
 *
 * A `series` patch aimed at a series id still carries the *occurrence's* start and end;
 * `pushUpdate` re-anchors those onto the series' own first date with `anchorToSeries`
 * before sending, since only Google knows that date.
 */
export function buildUpdatePatch(
  row: { externalId: string; externalSeriesId: string | null },
  merged: PushableAppointment,
  scope: EditScope = "series",
): { targetEventId: string; patch: Partial<GoogleEventWrite> } {
  const body = appointmentToGoogleEvent(merged);

  if (scope === "occurrence") {
    // The instance id edits that occurrence alone (Google records it as an exception).
    // Only the times move: every other field is the occurrence's own, so resending it
    // would at best be a no-op, and a recurrence on an instance is a 400.
    return {
      targetEventId: row.externalId,
      patch: { start: body.start, end: body.end },
    };
  }

  // Recurrence is omitted for one-offs so a PATCH cannot invent a series. When the
  // merged row *has* a rule we send it: converting a repeating timed event to all-day
  // otherwise leaves Google's timed UNTIL beside date-only start/end, which it rejects
  // as "Invalid start time."
  const { recurrence, ...instanceFields } = body;
  const patch: Partial<GoogleEventWrite> = instanceFields;
  if (merged.recurrenceFrequency !== "none") {
    patch.recurrence = recurrence;
  }

  // An instance id ("evt-1_20260810T090000Z") edits a single occurrence; the series id
  // edits the rule. The drawer edits the series.
  return { targetEventId: row.externalSeriesId || row.externalId, patch };
}

/** Calendar day of a Google time: its `date`, or its `dateTime`'s day in `timeZone`. */
function dayKeyOf(time: GoogleEventTime, timeZone: string): string | null {
  if (time.date) return time.date;
  if (time.dateTime) return zonedDateKey(new Date(time.dateTime), timeZone);
  return null;
}

/** Wall-clock `HH:mm:ss` of an RFC 3339 instant in `timeZone`. */
function wallTimeOf(dateTime: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(dateTime));
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return `${part("hour")}:${part("minute")}:${part("second")}`;
}

/**
 * Refuse a `series` edit that moves the opened occurrence to another day.
 *
 * `previousStart` is the occurrence as stored, `start` the edited one, both written the
 * way `writeEventTime` writes them. See `SeriesDateChangeError` for why this is refused
 * rather than guessed at.
 */
export function assertSeriesDayUnchanged(
  start: GoogleEventTime,
  previousStart: GoogleEventTime,
  timeZone: string = writeTimeZone(),
): void {
  if (dayKeyOf(start, timeZone) !== dayKeyOf(previousStart, timeZone)) {
    throw new SeriesDateChangeError();
  }
}

/**
 * Move a `series` patch built from one occurrence onto the series' own first date.
 *
 * The root cause this exists for: the local table holds only instances, so the drawer and
 * the connector edit a series *through* one of its occurrences, and the patch carried
 * that occurrence's start. PATCHing a series master's `start` sets its DTSTART, so opening
 * the third Monday and changing only the title re-anchored the series on the third Monday
 * and dropped the first two.
 *
 * Keeps `seriesStart`'s calendar day and takes the edited occurrence's wall-clock time of
 * day, duration (as an end-day offset plus an end time), and all-day flag — Google
 * Calendar's "All events". Timed values are written as floating local times with a named
 * zone, which Google accepts and which keeps 9:00 at 9:00 whichever side of a DST change
 * the series began; a fixed UTC instant computed from November's offset would put an
 * August start an hour off. The day itself must not change; see `assertSeriesDayUnchanged`.
 */
export function anchorToSeries(
  patch: Partial<GoogleEventWrite>,
  previousStart: GoogleEventTime,
  seriesStart: GoogleEventTime,
  timeZone: string = writeTimeZone(),
): Partial<GoogleEventWrite> {
  const { start, end } = patch;
  if (!start || !end) return patch;
  assertSeriesDayUnchanged(start, previousStart, timeZone);

  const anchorDay = dayKeyOf(seriesStart, timeZone);
  const startDay = dayKeyOf(start, timeZone);
  const endDay = dayKeyOf(end, timeZone);
  if (!anchorDay || !startDay || !endDay) {
    throw new Error("Google returned a repeating event without a start.");
  }
  const endDayOffset = daysBetweenKeys(startDay, endDay);

  if (start.date) {
    return {
      ...patch,
      start: { date: anchorDay, dateTime: null, timeZone },
      end: { date: shiftDateKey(anchorDay, endDayOffset), dateTime: null, timeZone },
    };
  }
  if (!start.dateTime || !end.dateTime) {
    throw new Error("A timed event needs a start and end time.");
  }
  return {
    ...patch,
    start: {
      date: null,
      dateTime: `${anchorDay}T${wallTimeOf(start.dateTime, timeZone)}`,
      timeZone,
    },
    end: {
      date: null,
      dateTime: `${shiftDateKey(anchorDay, endDayOffset)}T${wallTimeOf(end.dateTime, timeZone)}`,
      timeZone,
    },
  };
}

/**
 * Patch the Google-owned fields of an existing event.
 *
 * Only rows that carry an external ref are pushed; a local-only row stays local. Returns
 * the refreshed etag/updated stamp, or null when there was nothing to push.
 *
 * A `series` edit of an occurrence reads the series master first, for the first date
 * `anchorToSeries` keeps. It is still one PATCH of the existing series id — never an
 * insert — so Google's series, its id, and its exceptions survive, and the next mirror
 * pass brings the moved occurrences back as ordinary rows.
 *
 * A 404/410 from Google means the event was deleted elsewhere. Unlike `pushDelete`, which
 * treats gone as success (the goal was absence), a patch that cannot land must not write
 * locally — the two would diverge. The error is rewritten to a clear user-facing sentence
 * so the drawer does not surface a calendar-id blob or a bare "Internal error".
 */
export async function pushUpdate(
  userId: string,
  row: Pick<
    Appointment,
    | "externalSource"
    | "externalId"
    | "externalCalendarId"
    | "externalSeriesId"
    | "startAt"
    | "allDay"
  >,
  merged: PushableAppointment,
  scope: EditScope = "series",
): Promise<Partial<ExternalStamp> | null> {
  if (row.externalSource !== "google" || !row.externalId || !row.externalCalendarId) {
    return null;
  }

  const built = buildUpdatePatch(
    { externalId: row.externalId, externalSeriesId: row.externalSeriesId },
    merged,
    scope,
  );
  let patch = built.patch;
  const editsSeriesFromOccurrence = scope === "series" && Boolean(row.externalSeriesId);
  const previousStart = writeEventTime(row.startAt, row.allDay);
  // Before any network: a refused edit should cost nothing.
  if (editsSeriesFromOccurrence && patch.start) {
    assertSeriesDayUnchanged(patch.start, previousStart);
  }

  let event;
  try {
    if (editsSeriesFromOccurrence) {
      const series = await getEvent(
        userId,
        row.externalCalendarId,
        built.targetEventId,
      );
      if (!series.start) {
        throw new Error("Google returned a repeating event without a start.");
      }
      patch = anchorToSeries(patch, previousStart, series.start);
    }
    event = await patchEvent(
      userId,
      row.externalCalendarId,
      built.targetEventId,
      patch,
    );
  } catch (error) {
    if (error instanceof GoogleEventGoneError) {
      throw new GoogleEventGoneError(GOOGLE_EVENT_GONE_MESSAGE);
    }
    throw error;
  }
  const updated = event.updated ? new Date(event.updated) : null;
  return {
    externalEtag: event.etag ?? null,
    externalUpdatedAt: updated && !Number.isNaN(updated.getTime()) ? updated : null,
  };
}

/**
 * Delete the event in Google before the local row goes.
 *
 * Ordering matters: if Google refuses, the mutation throws and the local row survives, so
 * the two stay in step. Deleting locally first would leave an orphan in Google with no
 * record here of what to remove — the exact situation the tombstone table in the original
 * design existed to handle.
 */
export async function pushDelete(
  userId: string,
  row: Pick<Appointment, "externalSource" | "externalId" | "externalCalendarId">,
): Promise<void> {
  if (row.externalSource !== "google" || !row.externalId || !row.externalCalendarId) {
    return;
  }
  await deleteEvent(userId, row.externalCalendarId, row.externalId);
}
