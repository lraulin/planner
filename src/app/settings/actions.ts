"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUserId } from "@/lib/auth";
import * as settings from "@/lib/settings/mutations";
import { disconnectGoogle, setCalendarSyncEnabled } from "@/lib/google/mutations";
import { refreshCalendarsFromGoogle } from "@/lib/google/sync";
import { run as runAction, type ActionResult } from "../actionResult";

/**
 * Thin wrappers: resolve the user, delegate, and return `{ ok: false, error }` rather than
 * throwing. Same `run()` as everywhere else, with one deliberate omission —
 * **no `revalidatePath`**, which is why every call here passes `revalidate: []`.
 *
 * These fire on every filter change, sort click, and column drag. Revalidating the layout
 * for each one would refetch the entire page tree to deliver state the client already
 * applied optimistically. The provider is the live copy; the row is only what the *next*
 * page load reads, and every page is `force-dynamic`, so it re-reads on navigation anyway.
 */

function run(work: (userId: string) => Promise<void>): Promise<ActionResult> {
  return runAction(work, { revalidate: [] });
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

// ── Google Calendar ──────────────────────────────────────────────────────────

/**
 * Pull the calendar list from Google and reconcile it into `google_calendar_links`.
 * Called when the settings panel mounts and on demand, so a calendar added in Google
 * shows up here without reconnecting.
 */
export async function refreshGoogleCalendarsAction(): Promise<ActionResult> {
  try {
    const userId = await getCurrentUserId();
    await refreshCalendarsFromGoogle(userId);
    revalidatePath("/settings");
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Could not reach Google Calendar.",
    };
  }
}

/**
 * Detach the signed-in account from Google. Revalidates the whole layout because it empties
 * the schedule of every mirrored event, not just the settings panel.
 */
export async function disconnectGoogleAction(): Promise<ActionResult> {
  try {
    const userId = await getCurrentUserId();
    await disconnectGoogle(userId);
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not disconnect Google.",
    };
  }
}

export async function setCalendarSyncEnabledAction(
  calendarId: string,
  enabled: boolean,
): Promise<ActionResult> {
  // Unlike the preference writes above, this one takes the default revalidation: turning a
  // calendar on or off changes what the schedule shows, not just how it is laid out.
  return runAction((userId) => setCalendarSyncEnabled(userId, calendarId, enabled));
}
