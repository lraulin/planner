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
 * Whether the mirrored calendars need pulling again: `off` with nothing enabled, `stale`
 * when an enabled calendar has not synced within `maxAgeMs`, otherwise `fresh`.
 *
 * A calendar that has never synced (`lastSyncedAt` null) is stale by definition. With no
 * enabled calendars there is nothing to fetch, so `/schedule` skips the network entirely.
 *
 * Takes the links rather than reading them: the schedule already loads every link for its
 * colours, and asking again here — twice, once to count and once to date — put two round
 * trips in front of everything else the page reads.
 */
export function mirrorFreshness(
  links: readonly GoogleCalendarLink[],
  maxAgeMs: number,
): "off" | "stale" | "fresh" {
  const enabled = links.filter((link) => link.syncEnabled);
  if (enabled.length === 0) return "off";
  const cutoff = Date.now() - maxAgeMs;
  return enabled.some(
    (link) => !link.lastSyncedAt || link.lastSyncedAt.getTime() < cutoff,
  )
    ? "stale"
    : "fresh";
}
