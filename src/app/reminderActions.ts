"use server";

import {
  runQuery,
  run,
  runWithData,
  type QueryResult,
  type ActionResult,
} from "@/app/actionResult";
import type { DataActionResult } from "@/app/actionResult";
import { zonedDateKey } from "@/lib/schedule/geometry";
import { READER_TIME_ZONE } from "@/lib/schedule/readerZone";
import { isSnoozeChoice } from "@/lib/reminders/derive";
import {
  completeReminder,
  dismissAllReminders,
  dismissReminder,
  snoozeReminder,
} from "@/lib/reminders/mutations";
import { listFiredReminders, type FiredReminder } from "@/lib/reminders/queries";

/**
 * Server actions behind the Reminders panel. Thin: resolve the user, delegate to
 * `src/lib/reminders`. Snooze and dismiss change nothing any page shows, so they do not
 * revalidate; Complete changes a task or an appointment, so it does.
 */

export type PanelReminder = FiredReminder & { dayKey: string };

export async function listRemindersAction(): Promise<QueryResult<PanelReminder[]>> {
  return runQuery(async (userId) =>
    (await listFiredReminders(userId)).map((reminder) => ({
      ...reminder,
      dayKey: zonedDateKey(reminder.dueAt, READER_TIME_ZONE),
    })),
  );
}

export async function snoozeReminderAction(
  id: string,
  choice: string,
): Promise<DataActionResult<{ fireAt: Date }>> {
  return runWithData(
    async (userId) => {
      if (!isSnoozeChoice(choice)) throw new Error("Choose how long to snooze.");
      return { fireAt: await snoozeReminder(userId, id, choice) };
    },
    { revalidate: [] },
  );
}

export async function dismissReminderAction(id: string): Promise<ActionResult> {
  return run((userId) => dismissReminder(userId, id), { revalidate: [] });
}

export async function dismissAllRemindersAction(): Promise<ActionResult> {
  return run((userId) => dismissAllReminders(userId), { revalidate: [] });
}

export async function completeReminderAction(id: string): Promise<ActionResult> {
  return run((userId) => completeReminder(userId, id));
}
