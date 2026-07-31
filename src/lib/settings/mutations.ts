import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { userSettings } from "@/db/schema";
import { isValidScope } from "./scopes";

/**
 * Writes to `user_settings`. Every function takes `userId` first and scopes by it — these
 * rows are per-user and nothing here may ever be reachable by id alone.
 *
 * Nothing stored here is authoritative data, so the failure posture is loose on read and
 * strict on write: a corrupt row degrades to defaults when parsed, but a scope that is not
 * one this app writes is rejected rather than stored. Otherwise a bug in a call site fills
 * the table with rows nothing will ever read and the reset page cannot label.
 */

/** Roughly a very large column layout. Guards against a runaway client loop. */
const MAX_VALUE_BYTES = 64 * 1024;

export class InvalidSettingError extends Error {}

function assertWritable(scope: string, value: unknown): void {
  if (!isValidScope(scope)) {
    throw new InvalidSettingError(`Unknown settings scope: ${scope}`);
  }
  if (value === undefined) {
    throw new InvalidSettingError(`Settings value for ${scope} is undefined`);
  }

  let encoded: string;
  try {
    encoded = JSON.stringify(value);
  } catch {
    throw new InvalidSettingError(`Settings value for ${scope} is not serializable`);
  }
  // `JSON.stringify` returns undefined for a bare function or symbol.
  if (encoded === undefined) {
    throw new InvalidSettingError(`Settings value for ${scope} is not serializable`);
  }
  if (encoded.length > MAX_VALUE_BYTES) {
    throw new InvalidSettingError(`Settings value for ${scope} is too large`);
  }
}

/** Upsert one scope. The unique index on `(user_id, scope)` is what makes this idempotent. */
export async function writeUserSetting(
  userId: string,
  scope: string,
  value: unknown,
): Promise<void> {
  assertWritable(scope, value);

  await db
    .insert(userSettings)
    .values({ userId, scope, value })
    .onConflictDoUpdate({
      target: [userSettings.userId, userSettings.scope],
      set: { value, updatedAt: new Date() },
    });
}

/**
 * Upsert several scopes at once — what the client's pending-write queue drains into.
 *
 * Validated up front so one bad scope rejects the whole batch instead of leaving half of
 * it applied, and written in a transaction for the same reason.
 */
export async function writeUserSettings(
  userId: string,
  entries: { scope: string; value: unknown }[],
): Promise<void> {
  if (entries.length === 0) return;
  for (const entry of entries) assertWritable(entry.scope, entry.value);

  await db.transaction(async (tx) => {
    for (const entry of entries) {
      await tx
        .insert(userSettings)
        .values({ userId, scope: entry.scope, value: entry.value })
        .onConflictDoUpdate({
          target: [userSettings.userId, userSettings.scope],
          set: { value: entry.value, updatedAt: new Date() },
        });
    }
  });
}

/**
 * Forget one scope, so it falls back to defaults on the next read.
 *
 * Deliberately not scope-validated: a row written by an older build under a scope this
 * version no longer knows must still be resettable, or it would be stuck forever.
 */
export async function resetUserSetting(userId: string, scope: string): Promise<void> {
  await db
    .delete(userSettings)
    .where(and(eq(userSettings.userId, userId), eq(userSettings.scope, scope)));
}

/** Forget every scope for one user. Never touches another user's rows. */
export async function resetAllUserSettings(userId: string): Promise<void> {
  await db.delete(userSettings).where(eq(userSettings.userId, userId));
}
