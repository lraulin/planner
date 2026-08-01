import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { accounts, appointments, googleCalendarLinks } from "@/db/schema";
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

/**
 * Detach this account from Google entirely: the OAuth grant, the calendar list, and the
 * mirror.
 *
 * The inverse of `linkSocial` in the settings panel, and the reason it exists is that
 * without it there was no way to *stop* an account from reaching a real calendar short of
 * hand-written SQL. Sync is bidirectional, so "which account is linked" is a data-safety
 * question, not a preference.
 *
 * **Mirrored appointments are deleted, not orphaned.** Nulling their `external_*` columns
 * would leave a frozen copy of a calendar that no longer syncs, and re-linking later would
 * insert every event again — the partial unique index is on
 * `(user_id, external_source, external_id)`, so rows with the source cleared no longer
 * collide with their own re-import. Deleting is what makes re-linking idempotent. Those
 * events still exist in Google, which is their source of truth; appointments that only ever
 * existed here carry no `external_source` and stay.
 *
 * Deleting the `accounts` row drops our stored tokens; it does **not** revoke the grant at
 * Google. That is deliberate — the OAuth client is shared with production, so revoking to
 * tidy up one environment would break the other.
 */
export async function disconnectGoogle(userId: string): Promise<void> {
  await db
    .delete(appointments)
    .where(
      and(eq(appointments.userId, userId), eq(appointments.externalSource, "google")),
    );

  await clearCalendarLinks(userId);

  await db
    .delete(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.providerId, "google")));
}
