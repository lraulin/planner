"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUserId } from "@/lib/auth";
import * as settings from "@/lib/settings/mutations";
import { setCalendarSyncEnabled } from "@/lib/google/mutations";
import { refreshCalendarsFromGoogle } from "@/lib/google/sync";

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

export async function setCalendarSyncEnabledAction(
  calendarId: string,
  enabled: boolean,
): Promise<ActionResult> {
  try {
    const userId = await getCurrentUserId();
    await setCalendarSyncEnabled(userId, calendarId, enabled);
    // Unlike the preference writes above, this one does revalidate: turning a calendar on
    // or off changes what the schedule shows, not just how it is laid out.
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Something went wrong.",
    };
  }
}
