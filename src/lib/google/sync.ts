/**
 * Orchestrate one mirror pass: fetch from Google, ask `planMirror` what to do, apply it.
 *
 * All the judgement lives in `mirror.ts`, which is pure and tested. This file is the
 * plumbing around it, and deliberately holds no rules of its own beyond error handling.
 */

import { and, eq, gte, inArray, lt } from "drizzle-orm";
import { db } from "@/db";
import { appointments } from "@/db/schema";
import {
  GoogleNotLinkedError,
  listCalendars,
  listEvents,
  type GoogleCalendarListEntry,
} from "./client";
import {
  planMirror,
  type LocalMirrorRow,
  type MirrorWindow,
  type RemoteEvent,
} from "./mirror";
import { markCalendarsSynced, refreshCalendarLinks } from "./mutations";
import { enabledCalendarLinks, isGoogleLinked, syncIsStale } from "./queries";

/** How long a mirrored window stays fresh before loading `/schedule` refetches it. */
export const SYNC_MAX_AGE_MS = 5 * 60_000;

export type SyncStatus =
  | { state: "off" }
  | { state: "ok"; inserted: number; updated: number; deleted: number }
  | { state: "skipped" }
  | { state: "not_linked"; message: string }
  | { state: "failed"; message: string };

/**
 * Rows that could be affected by a sync of this window. Mirrors the range predicate in
 * `planMirror` — anything overlapping [start, end).
 */
async function loadLocalRows(
  userId: string,
  window: MirrorWindow,
): Promise<LocalMirrorRow[]> {
  return db
    .select({
      id: appointments.id,
      externalSource: appointments.externalSource,
      externalId: appointments.externalId,
      externalCalendarId: appointments.externalCalendarId,
      externalEtag: appointments.externalEtag,
      colorId: appointments.colorId,
      startAt: appointments.startAt,
      endAt: appointments.endAt,
    })
    .from(appointments)
    .where(
      and(
        eq(appointments.userId, userId),
        lt(appointments.startAt, window.end),
        gte(appointments.endAt, window.start),
      ),
    );
}

/**
 * Pull one window of Google events into `appointments`.
 *
 * Every fetch is per-calendar and failures are collected rather than thrown, so one broken
 * calendar cannot abort the others — and, critically, only the calendars that *answered*
 * are handed to `planMirror` as sweep scope. A calendar whose request failed is silence we
 * must not read as "Google deleted everything on it".
 */
export async function syncWindow(
  userId: string,
  window: MirrorWindow,
): Promise<SyncStatus> {
  const links = await enabledCalendarLinks(userId);
  if (links.length === 0) return { state: "off" };

  const remote: RemoteEvent[] = [];
  const fetchedCalendarIds: string[] = [];
  let firstError: unknown = null;

  for (const link of links) {
    try {
      const events = await listEvents(
        userId,
        link.calendarId,
        window.start,
        window.end,
      );
      for (const event of events) {
        remote.push({ event, calendarId: link.calendarId });
      }
      fetchedCalendarIds.push(link.calendarId);
    } catch (error) {
      firstError ??= error;
      if (error instanceof GoogleNotLinkedError) break;
    }
  }

  // Nothing answered — apply nothing. Reporting the failure and leaving the mirror exactly
  // as it was is the only safe response.
  if (fetchedCalendarIds.length === 0) {
    if (firstError instanceof GoogleNotLinkedError) {
      return { state: "not_linked", message: firstError.message };
    }
    return {
      state: "failed",
      message:
        firstError instanceof Error
          ? firstError.message
          : "Could not reach Google Calendar.",
    };
  }

  const local = await loadLocalRows(userId, window);
  const plan = planMirror(local, remote, window, fetchedCalendarIds);

  for (const fields of plan.toInsert) {
    await db
      .insert(appointments)
      .values({ userId, ...fields })
      .onConflictDoNothing();
  }

  for (const { id, fields } of plan.toUpdate) {
    // Spreading GoogleOwnedFields is what keeps the planner's annotations safe: the type
    // has no member for checkState, priority, contexts, private or projectId, so this
    // cannot reach them however the mirror changes.
    await db
      .update(appointments)
      .set({ ...fields, updatedAt: new Date() })
      .where(and(eq(appointments.id, id), eq(appointments.userId, userId)));
  }

  if (plan.toDelete.length > 0) {
    await db
      .delete(appointments)
      .where(
        and(eq(appointments.userId, userId), inArray(appointments.id, plan.toDelete)),
      );
  }

  await markCalendarsSynced(userId, fetchedCalendarIds);

  const status: SyncStatus = {
    state: "ok",
    inserted: plan.toInsert.length,
    updated: plan.toUpdate.length,
    deleted: plan.toDelete.length,
  };
  // A partial failure still applied what it could; surface it so the banner appears.
  if (firstError) {
    return {
      state: "failed",
      message:
        firstError instanceof Error
          ? firstError.message
          : "Some calendars could not be read.",
    };
  }
  return status;
}

/**
 * Sync only if the window has gone stale. This is what `loadSchedule` calls on every page
 * view, so the throttle is the difference between "fresh enough" and a Google round trip
 * on every navigation.
 */
export async function syncWindowIfStale(
  userId: string,
  window: MirrorWindow,
): Promise<SyncStatus> {
  // "Off" and "fresh" are different answers and the UI treats them differently: off hides
  // the Refresh button entirely, fresh leaves it available. Checking staleness first would
  // report an unconfigured install as merely fresh, and offer a button that can only fail.
  if ((await enabledCalendarLinks(userId)).length === 0) return { state: "off" };
  if (!(await syncIsStale(userId, SYNC_MAX_AGE_MS))) return { state: "skipped" };
  return syncWindow(userId, window);
}

/**
 * Fetch the calendar list from Google and reconcile it into `google_calendar_links`.
 * Used by the settings panel; separate from event syncing because it is a different
 * cadence and a different failure story.
 */
export async function refreshCalendarsFromGoogle(
  userId: string,
): Promise<GoogleCalendarListEntry[]> {
  const entries = await listCalendars(userId);
  await refreshCalendarLinks(userId, entries);
  return entries;
}

/** Whether the connect flow has been completed, for the settings panel. */
export async function googleConnectionState(userId: string): Promise<boolean> {
  return isGoogleLinked(userId);
}
