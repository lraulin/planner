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
import { deleteEvent, GoogleEventGoneError, insertEvent, patchEvent } from "./client";
import {
  appointmentToGoogleEvent,
  type GoogleEvent,
  type GoogleEventWrite,
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
  | { pushed: true; recurring: false; stamp: ExternalStamp }
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
  const event = await insertEvent(userId, calendarId, body);

  if (body.recurrence?.length) {
    if (!event.id) throw new Error("Google did not return an id for the new series.");
    return { pushed: true, recurring: true, seriesId: event.id, calendarId };
  }

  const stamp = stampFrom(event, calendarId);
  if (!stamp) throw new Error("Google did not return an id for the new event.");
  return { pushed: true, recurring: false, stamp };
}

/**
 * Patch the Google-owned fields of an existing event.
 *
 * Only rows that carry an external ref are pushed; a local-only row stays local. Returns
 * the refreshed etag/updated stamp, or null when there was nothing to push.
 *
 * A 404/410 from Google means the event was deleted elsewhere. Unlike `pushDelete`, which
 * treats gone as success (the goal was absence), a patch that cannot land must not write
 * locally — the two would diverge. The error is rewritten to a clear user-facing sentence
 * so the drawer does not surface a calendar-id blob or a bare "Internal error".
 */
/**
 * Which Google event a local edit targets, and the body to PATCH onto it.
 *
 * Split out of `pushUpdate` because this is the whole of the interesting reasoning and
 * none of the network: an instance id would edit one occurrence when the user meant the
 * series, and the recurrence field is conditional. Kept pure so its test needs neither a
 * Google token nor a mocked client — the standard's "prefer real values over mocks", and
 * the reason the unit suite has no `vi.mock` left to leak across a shared worker.
 */
export function buildUpdatePatch(
  row: { externalId: string; externalSeriesId: string | null },
  merged: PushableAppointment,
): { targetEventId: string; patch: Partial<GoogleEventWrite> } {
  const body = appointmentToGoogleEvent(merged);
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

export async function pushUpdate(
  userId: string,
  row: Pick<
    Appointment,
    "externalSource" | "externalId" | "externalCalendarId" | "externalSeriesId"
  >,
  merged: PushableAppointment,
): Promise<Partial<ExternalStamp> | null> {
  if (row.externalSource !== "google" || !row.externalId || !row.externalCalendarId) {
    return null;
  }

  const { targetEventId, patch } = buildUpdatePatch(
    { externalId: row.externalId, externalSeriesId: row.externalSeriesId },
    merged,
  );

  let event;
  try {
    event = await patchEvent(userId, row.externalCalendarId, targetEventId, patch);
  } catch (error) {
    if (error instanceof GoogleEventGoneError) {
      throw new Error(GOOGLE_EVENT_GONE_MESSAGE);
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
