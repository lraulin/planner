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
import { deleteEvent, insertEvent, patchEvent } from "./client";
import {
  appointmentToGoogleEvent,
  type GoogleEvent,
  type GoogleEventWrite,
} from "./mapping";
import { pushTargetCalendarId } from "./queries";

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
 */
export async function pushUpdate(
  userId: string,
  row: Pick<Appointment, "externalSource" | "externalId" | "externalCalendarId">,
  merged: PushableAppointment,
): Promise<Partial<ExternalStamp> | null> {
  if (row.externalSource !== "google" || !row.externalId || !row.externalCalendarId) {
    return null;
  }

  const body = appointmentToGoogleEvent(merged);
  // Recurrence is never patched from here. The local row is one instance of a series
  // Google owns; sending a rule would rewrite the whole series from a single occurrence.
  const { recurrence: _recurrence, ...instanceFields } = body;
  const patch: Partial<GoogleEventWrite> = instanceFields;

  const event = await patchEvent(userId, row.externalCalendarId, row.externalId, patch);
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
