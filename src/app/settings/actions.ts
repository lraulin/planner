"use server";

import { getCurrentUserId } from "@/lib/auth";
import * as settings from "@/lib/settings/mutations";

/**
 * Thin wrappers: resolve the user, delegate, and return `{ ok: false, error }` rather than
 * throwing. Same `run()` shape as `src/app/day/actions.ts`, with one deliberate omission —
 * **no `revalidatePath`**.
 *
 * These fire on every filter change, sort click, and column drag. Revalidating the layout
 * for each one would refetch the entire page tree to deliver state the client already
 * applied optimistically. The provider is the live copy; the row is only what the *next*
 * page load reads, and every page is `force-dynamic`, so it re-reads on navigation anyway.
 */

export type ActionResult = { ok: true } | { ok: false; error: string };

async function run(work: (userId: string) => Promise<void>): Promise<ActionResult> {
  try {
    const userId = await getCurrentUserId();
    await work(userId);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Something went wrong.",
    };
  }
}

/**
 * Persist a batch of scopes. The client queues writes and drains them here, so a burst of
 * filter clicks costs one round trip rather than one per click.
 */
export async function saveSettingsAction(
  entries: { scope: string; value: unknown }[],
): Promise<ActionResult> {
  return run((userId) => settings.writeUserSettings(userId, entries));
}

export async function resetSettingScopeAction(scope: string): Promise<ActionResult> {
  return run((userId) => settings.resetUserSetting(userId, scope));
}

export async function resetAllSettingsAction(): Promise<ActionResult> {
  return run((userId) => settings.resetAllUserSettings(userId));
}
