import { eq } from "drizzle-orm";
import { db } from "@/db";
import { bankConnections, googleCalendarLinks } from "@/db/schema";
import { syncAll, type SyncResult } from "@/lib/banksync/sync";
import { syncWindow, type SyncStatus } from "@/lib/google/sync";
import type { MirrorWindow } from "@/lib/google/mirror";
import {
  bankResultOk,
  calendarCronWindow,
  calendarStatusOk,
  cronReport,
  errorMessage,
  type CronReport,
  type UserOutcome,
} from "./report";

/**
 * The scheduled syncs. Each runs the *same* function its manual counterpart runs — the
 * "Sync now" button's `syncAll`, the schedule page's `syncWindow` — for every user who has
 * something to sync, so a scheduled run and a button press cannot drift apart.
 *
 * Users run one after another and each is caught on its own: one user's dead connection
 * must not stop another's sync. Both underlying syncs are idempotent (reconcile against
 * what is stored), which matters because Vercel's cron delivery is best-effort and can
 * occasionally invoke a job twice.
 */

/** Users with at least one SimpleFIN connection. */
export async function bankSyncUserIds(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ userId: bankConnections.userId })
    .from(bankConnections);
  return rows.map((row) => row.userId);
}

/** Users mirroring at least one Google calendar. */
export async function calendarSyncUserIds(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ userId: googleCalendarLinks.userId })
    .from(googleCalendarLinks)
    .where(eq(googleCalendarLinks.syncEnabled, true));
  return rows.map((row) => row.userId);
}

async function forEachUser<T>(
  userIds: string[],
  run: (userId: string) => Promise<T>,
  ok: (result: T) => boolean,
): Promise<UserOutcome<T>[]> {
  const outcomes: UserOutcome<T>[] = [];
  for (const userId of userIds) {
    try {
      const result = await run(userId);
      outcomes.push(
        ok(result) ? { userId, ok: true, result } : { userId, ok: false, result },
      );
    } catch (error) {
      outcomes.push({ userId, ok: false, error: errorMessage(error) });
    }
  }
  return outcomes;
}

export async function runBankSyncJob(
  deps: { syncAll: (userId: string) => Promise<SyncResult> } = { syncAll },
): Promise<CronReport<SyncResult>> {
  const users = await forEachUser(await bankSyncUserIds(), deps.syncAll, bankResultOk);
  return cronReport("bank-sync", users);
}

export async function runCalendarSyncJob(
  now: Date,
  deps: {
    syncWindow: (userId: string, window: MirrorWindow) => Promise<SyncStatus>;
  } = { syncWindow },
): Promise<CronReport<SyncStatus>> {
  const window = calendarCronWindow(now);
  const users = await forEachUser(
    await calendarSyncUserIds(),
    (userId) => deps.syncWindow(userId, window),
    calendarStatusOk,
  );
  return cronReport("calendar-sync", users);
}
