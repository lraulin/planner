import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { appointments, googleCalendarLinks } from "@/db/schema";
import type { GoogleCalendarListEntry } from "./client";

/**
 * Reconcile the stored calendar list against what Google reports.
 *
 * `syncEnabled` is the user's choice, so an upsert must never overwrite it — a refresh
 * that silently re-enabled a calendar someone deliberately turned off would look like the
 * app second-guessing them. Everything else (name, colour, primary flag) is Google's and
 * is refreshed every time.
 *
 * Calendars that disappeared from Google are removed, which also drops their rows'
 * eligibility for the mirror sweep on the next pass.
 */
export async function refreshCalendarLinks(
  userId: string,
  entries: GoogleCalendarListEntry[],
): Promise<void> {
  const existing = await db
    .select()
    .from(googleCalendarLinks)
    .where(eq(googleCalendarLinks.userId, userId));

  const existingByCalendarId = new Map(existing.map((row) => [row.calendarId, row]));
  const seen = new Set<string>();

  for (const entry of entries) {
    if (!entry.id) continue;
    seen.add(entry.id);
    const prior = existingByCalendarId.get(entry.id);

    const googleOwned = {
      summary: entry.summary ?? "",
      backgroundColor: entry.backgroundColor ?? "",
      isPrimary: Boolean(entry.primary),
      updatedAt: new Date(),
    };

    if (prior) {
      await db
        .update(googleCalendarLinks)
        .set(googleOwned)
        .where(
          and(
            eq(googleCalendarLinks.id, prior.id),
            eq(googleCalendarLinks.userId, userId),
          ),
        );
      continue;
    }

    await db.insert(googleCalendarLinks).values({
      userId,
      calendarId: entry.id,
      ...googleOwned,
      // A newly discovered calendar starts off. Mirroring every shared and holiday
      // calendar on first connect would flood the week grid with events nobody asked for.
      // The primary calendar is the exception — it is what "just use Google Calendar"
      // means, and it is where our own writes go.
      syncEnabled: Boolean(entry.primary),
    });
  }

  const removed = existing
    .filter((row) => !seen.has(row.calendarId))
    .map((row) => row.id);
  if (removed.length > 0) {
    await db
      .delete(googleCalendarLinks)
      .where(
        and(
          eq(googleCalendarLinks.userId, userId),
          inArray(googleCalendarLinks.id, removed),
        ),
      );
  }
}

/**
 * Turn one calendar's mirroring on or off.
 *
 * Disabling also **drops that calendar's mirrored rows**. The sweep in `planMirror` can
 * never do this itself: it only reaps rows on calendars it actually fetched, and a disabled
 * calendar is by definition not fetched — so without this its events would sit in the week
 * grid forever, unreachable by any later sync. Unticking a calendar has to mean it
 * disappears, not that it freezes.
 *
 * Only google-origin rows for that calendar go; planner-native appointments carry no
 * `externalCalendarId` and are untouched.
 */
export async function setCalendarSyncEnabled(
  userId: string,
  calendarId: string,
  enabled: boolean,
): Promise<void> {
  const [row] = await db
    .update(googleCalendarLinks)
    .set({
      syncEnabled: enabled,
      updatedAt: new Date(),
      ...(enabled ? {} : { lastSyncedAt: null }),
    })
    .where(
      and(
        eq(googleCalendarLinks.userId, userId),
        eq(googleCalendarLinks.calendarId, calendarId),
      ),
    )
    .returning({ id: googleCalendarLinks.id });
  if (!row) throw new Error("Calendar not found.");

  if (!enabled) {
    await db
      .delete(appointments)
      .where(
        and(
          eq(appointments.userId, userId),
          eq(appointments.externalSource, "google"),
          eq(appointments.externalCalendarId, calendarId),
        ),
      );
  }
}

/** Stamp the calendars a sync pass actually read, which drives the staleness throttle. */
export async function markCalendarsSynced(
  userId: string,
  calendarIds: string[],
  at: Date = new Date(),
): Promise<void> {
  if (calendarIds.length === 0) return;
  await db
    .update(googleCalendarLinks)
    .set({ lastSyncedAt: at })
    .where(
      and(
        eq(googleCalendarLinks.userId, userId),
        inArray(googleCalendarLinks.calendarId, calendarIds),
      ),
    );
}

/** Forget every calendar for this user — used when Google is disconnected. */
export async function clearCalendarLinks(userId: string): Promise<void> {
  await db.delete(googleCalendarLinks).where(eq(googleCalendarLinks.userId, userId));
}
