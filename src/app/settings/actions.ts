"use server";

import { revalidatePath } from "next/cache";
import type { NodeType } from "@/db/schema";
import { getCurrentUserId } from "@/lib/auth";
import { exportAchieveXmlForUser } from "@/lib/achieve/exportLoad";
import { importAchieveXml, type ImportMode } from "@/lib/achieve/import";
import * as settings from "@/lib/settings/mutations";
import { disconnectGoogle, setCalendarSyncEnabled } from "@/lib/google/mutations";
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

// ── Achieve Full XML ─────────────────────────────────────────────────────────

export type ImportAchieveResult =
  | {
      ok: true;
      created: number;
      counts: Record<NodeType, number> | ExportCounts;
      warnings: string[];
      skippedTables: string[];
      message?: string;
    }
  | { ok: false; error: string };

type ExportCounts = {
  result_area: number;
  project: number;
  task: number;
  omitted: number;
};

export type ExportAchieveResult =
  | {
      ok: true;
      xml: string;
      counts: ExportCounts;
      warnings: string[];
    }
  | { ok: false; error: string };

/**
 * Import Achieve Full XML into the signed-in account. `replace` wipes the outline first.
 * Large files are fine as a string body for personal dumps (typically under a few MB).
 */
export async function importAchieveXmlAction(
  xml: string,
  mode: ImportMode,
): Promise<ImportAchieveResult> {
  try {
    if (!xml || !xml.trim()) {
      return { ok: false, error: "That file was empty." };
    }
    if (xml.length > 25 * 1024 * 1024) {
      return { ok: false, error: "File is larger than 25 MB." };
    }
    const userId = await getCurrentUserId();
    const result = await importAchieveXml({ userId, xml, mode });
    revalidatePath("/", "layout");
    return {
      ok: true,
      created: result.created,
      counts: result.counts,
      warnings: result.warnings,
      skippedTables: result.skippedTables,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Import failed.",
    };
  }
}

/** Export this account's outline as Achieve Full XML (achxml). */
export async function exportAchieveXmlAction(): Promise<ExportAchieveResult> {
  try {
    const userId = await getCurrentUserId();
    const result = await exportAchieveXmlForUser(userId);
    return {
      ok: true,
      xml: result.xml,
      counts: result.counts,
      warnings: result.warnings,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Export failed.",
    };
  }
}
