import { count, eq, max } from "drizzle-orm";
import { db } from "@/db";
import { bankConnections, googleCalendarLinks } from "@/db/schema";
import { freshness, healthReport, type HealthReport } from "./report";

/**
 * Read the health report. The newest successful sync across all connections and enabled
 * calendars: on a single-user deployment that is the one user's freshness, and the report
 * names nobody either way. A feature with nothing set up reports `null`, not stale.
 */
export async function loadHealth(now: Date): Promise<HealthReport> {
  const commit = process.env.VERCEL_GIT_COMMIT_SHA;
  try {
    const [[bank], [calendar]] = await Promise.all([
      db
        .select({ n: count(), last: max(bankConnections.lastSyncedAt) })
        .from(bankConnections),
      db
        .select({ n: count(), last: max(googleCalendarLinks.lastSyncedAt) })
        .from(googleCalendarLinks)
        .where(eq(googleCalendarLinks.syncEnabled, true)),
    ]);
    return healthReport({
      databaseOk: true,
      commit,
      bankSync: bank.n > 0 ? freshness(bank.last, now) : null,
      calendarSync: calendar.n > 0 ? freshness(calendar.last, now) : null,
    });
  } catch {
    // The cause may carry a connection string; the endpoint is public, so say only "down".
    return healthReport({
      databaseOk: false,
      commit,
      bankSync: null,
      calendarSync: null,
    });
  }
}
