import { and, eq } from "drizzle-orm";
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

/**
 * One scope, for a server read that needs a single setting rather than the whole snapshot.
 *
 * `loadSettingsForSession` is the right call inside a request that is already loading a
 * page's preferences — it is request-cached and resolves the user itself. This is for the
 * `lib` layer, where the contract is `userId` first and importing the session would invert
 * the dependency direction. Absent scope reads as `undefined`, which every parser in
 * `settings/` already treats as "use the default".
 */
export async function readSetting(userId: string, scope: string): Promise<unknown> {
  const [row] = await db
    .select({ value: userSettings.value })
    .from(userSettings)
    .where(and(eq(userSettings.userId, userId), eq(userSettings.scope, scope)))
    .limit(1);
  return row?.value;
}
