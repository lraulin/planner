import { eq } from "drizzle-orm";
import { db } from "@/db";
import { userSettings } from "@/db/schema";

/** Every scope a user has stored, keyed by scope id. Unset scopes are simply absent. */
export type SettingsSnapshot = Record<string, unknown>;

/**
 * One round trip for a user's whole preference set.
 *
 * This runs in the root layout on every request, so it is deliberately a single indexed
 * read of a handful of small rows rather than a query per scope. Scopes are not validated
 * here — a row written by an older build should still reach its parser, which knows how to
 * fall back.
 */
export async function loadUserSettings(userId: string): Promise<SettingsSnapshot> {
  const rows = await db
    .select({ scope: userSettings.scope, value: userSettings.value })
    .from(userSettings)
    .where(eq(userSettings.userId, userId));

  const snapshot: SettingsSnapshot = {};
  for (const row of rows) snapshot[row.scope] = row.value;
  return snapshot;
}
