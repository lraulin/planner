import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { accounts, googleCalendarLinks, type GoogleCalendarLink } from "@/db/schema";

/** Whether this user has a linked Google account at all. */
export async function isGoogleLinked(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.providerId, "google")))
    .limit(1);
  return Boolean(row);
}

export async function listCalendarLinks(userId: string): Promise<GoogleCalendarLink[]> {
  return db
    .select()
    .from(googleCalendarLinks)
    .where(eq(googleCalendarLinks.userId, userId))
    .orderBy(asc(googleCalendarLinks.summary));
}

/** Only the calendars the user chose to mirror. */
export async function enabledCalendarLinks(
  userId: string,
): Promise<GoogleCalendarLink[]> {
  return db
    .select()
    .from(googleCalendarLinks)
    .where(
      and(
        eq(googleCalendarLinks.userId, userId),
        eq(googleCalendarLinks.syncEnabled, true),
      ),
    )
    .orderBy(asc(googleCalendarLinks.summary));
}

/**
 * Where appointments created in the planner are written. Null before the calendar list has
 * been fetched once, which callers treat as "not set up yet" rather than falling back to
 * the literal `"primary"` alias — writing to a calendar the user has not seen listed is
 * how events end up somewhere surprising.
 */
export async function pushTargetCalendarId(userId: string): Promise<string | null> {
  const [row] = await db
    .select({ calendarId: googleCalendarLinks.calendarId })
    .from(googleCalendarLinks)
    .where(
      and(
        eq(googleCalendarLinks.userId, userId),
        eq(googleCalendarLinks.isPrimary, true),
      ),
    )
    .limit(1);
  return row?.calendarId ?? null;
}

/**
 * True when no enabled calendar has been synced within `maxAgeMs`.
 *
 * A calendar that has never synced (`lastSyncedAt` null) is stale by definition. With no
 * enabled calendars there is nothing to fetch, so it reports fresh and `/schedule` skips
 * the network entirely.
 */
export async function syncIsStale(userId: string, maxAgeMs: number): Promise<boolean> {
  const links = await enabledCalendarLinks(userId);
  if (links.length === 0) return false;
  const cutoff = Date.now() - maxAgeMs;
  return links.some(
    (link) => !link.lastSyncedAt || link.lastSyncedAt.getTime() < cutoff,
  );
}
