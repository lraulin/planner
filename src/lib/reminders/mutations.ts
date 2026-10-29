import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  nodes,
  pushSubscriptions,
  reminderOccurrences,
  type ReminderOccurrence,
} from "@/db/schema";
import { READER_TIME_ZONE } from "@/lib/schedule/readerZone";
import { setAppointmentCheckState } from "@/lib/schedule/mutations";
import { applyStateTransition, reopenSettledAncestors } from "@/lib/tree/mutations";
import {
  publishAll,
  rearmReminders,
  sourceRefOf,
  supersedeOrphanedReminders,
} from "./arm";
import { snoozeTarget, type SnoozeChoice } from "./derive";
import { isCompletable, pushToUser, REMINDERS_PANEL_URL } from "./push";
import { loadAppointmentReminderSources, loadNotificationPrefs } from "./queries";

/**
 * Acting on a reminder — snooze, dismiss, complete — and the devices it is delivered to.
 * Every function takes `userId` first and proves ownership before writing.
 *
 * Spec: `agent-os/specs/2026-10-28-2101-reminders-and-push-notifications/`.
 */

// ---------------------------------------------------------------------------------------
// Acting on a reminder

async function requireOccurrence(userId: string, id: string) {
  const [row] = await db
    .select()
    .from(reminderOccurrences)
    .where(and(eq(reminderOccurrences.id, id), eq(reminderOccurrences.userId, userId)))
    .limit(1);
  if (!row) throw new Error("Reminder not found.");
  return row;
}

function assertActive(row: ReminderOccurrence): void {
  if (row.state !== "fired" && row.state !== "scheduled") {
    throw new Error("That reminder has already been dealt with.");
  }
}

/** Snooze re-arms the same row: it leaves the panel and fires again at the target. */
export async function snoozeReminder(
  userId: string,
  id: string,
  choice: SnoozeChoice,
  now: Date = new Date(),
): Promise<Date> {
  const row = await requireOccurrence(userId, id);
  assertActive(row);
  const prefs = await loadNotificationPrefs(userId);
  const fireAt = snoozeTarget(choice, now, prefs, READER_TIME_ZONE);
  await db
    .update(reminderOccurrences)
    .set({ state: "scheduled", fireAt, updatedAt: now })
    .where(and(eq(reminderOccurrences.id, id), eq(reminderOccurrences.userId, userId)));
  await publishAll([{ id, fireAt }]);
  return fireAt;
}

export async function dismissReminder(userId: string, id: string): Promise<void> {
  const row = await requireOccurrence(userId, id);
  assertActive(row);
  await db
    .update(reminderOccurrences)
    .set({ state: "dismissed", updatedAt: new Date() })
    .where(and(eq(reminderOccurrences.id, id), eq(reminderOccurrences.userId, userId)));
}

/** Clears the panel. Snoozed rows are not in the panel, so they are left to fire. */
export async function dismissAllReminders(userId: string): Promise<number> {
  const dismissed = await db
    .update(reminderOccurrences)
    .set({ state: "dismissed", updatedAt: new Date() })
    .where(
      and(
        eq(reminderOccurrences.userId, userId),
        eq(reminderOccurrences.state, "fired"),
      ),
    )
    .returning({ id: reminderOccurrences.id });
  return dismissed.length;
}

/**
 * Complete the thing the reminder is about, from the reminder.
 *
 * A task or project goes through the same state transition as the drawer — upward cascade
 * only, as the drawer and the day page do, since neither this panel nor a notification has
 * the confirmation the downward cascade needs. A repeating task therefore cycles, and the
 * re-arm afterwards picks up its moved reminder. An appointment is checked off; a local
 * repeating master is not, because its check state is the whole series'.
 */
export async function completeReminder(
  userId: string,
  id: string,
  now: Date = new Date(),
): Promise<void> {
  const row = await requireOccurrence(userId, id);
  assertActive(row);
  if (!isCompletable(row.sourceKind)) {
    throw new Error("This reminder has nothing to complete.");
  }

  if (row.sourceKind === "task" || row.sourceKind === "project") {
    const [node] = await db
      .select({ id: nodes.id })
      .from(nodes)
      .where(and(eq(nodes.id, row.sourceId), eq(nodes.userId, userId)))
      .limit(1);
    if (!node) {
      await supersedeOrphanedReminders(userId);
      throw new Error(`That ${row.sourceKind} no longer exists.`);
    }
    await db.transaction(async (tx) => {
      await applyStateTransition(tx, userId, row.sourceId, "completed", now);
      await reopenSettledAncestors(tx, userId, row.sourceId, "completed");
    });
  } else {
    const [appointment] = await loadAppointmentReminderSources(userId, {
      ids: [row.sourceId],
    });
    if (!appointment) {
      await supersedeOrphanedReminders(userId);
      throw new Error("That appointment no longer exists.");
    }
    if (appointment.recurrenceFrequency === "none") {
      await setAppointmentCheckState(userId, row.sourceId, "done");
    }
  }

  await db
    .update(reminderOccurrences)
    .set({ state: "completed", updatedAt: now })
    .where(and(eq(reminderOccurrences.id, id), eq(reminderOccurrences.userId, userId)));

  const ref = sourceRefOf(row);
  if (ref) await rearmReminders(userId, [ref]);
}

// ---------------------------------------------------------------------------------------
// Devices

export type PushSubscriptionInput = {
  endpoint: string;
  p256dh: string;
  auth: string;
  label: string;
};

function assertSubscription(input: PushSubscriptionInput): void {
  let url: URL;
  try {
    url = new URL(input.endpoint);
  } catch {
    throw new Error("That push subscription has no valid endpoint.");
  }
  // Push services are HTTPS; anything else is not a browser's subscription.
  if (url.protocol !== "https:") throw new Error("Push endpoints must be HTTPS.");
  if (!input.p256dh || !input.auth)
    throw new Error("That push subscription has no keys.");
}

/**
 * Store this browser's subscription. The endpoint identifies the browser, so subscribing
 * again replaces the keys — and moves the row to whoever is signed in now.
 */
export async function savePushSubscription(
  userId: string,
  input: PushSubscriptionInput,
): Promise<string> {
  assertSubscription(input);
  const label = input.label.trim().slice(0, 80);
  const [row] = await db
    .insert(pushSubscriptions)
    .values({
      userId,
      endpoint: input.endpoint,
      p256dh: input.p256dh,
      auth: input.auth,
      label,
    })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { userId, p256dh: input.p256dh, auth: input.auth, label },
    })
    .returning({ id: pushSubscriptions.id });
  return row.id;
}

export async function removePushSubscription(
  userId: string,
  id: string,
): Promise<void> {
  const removed = await db
    .delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.id, id), eq(pushSubscriptions.userId, userId)))
    .returning({ id: pushSubscriptions.id });
  if (removed.length === 0) throw new Error("Device not found.");
}

/** Remove by endpoint — what the browser knows about itself when it turns notifications off. */
export async function removePushSubscriptionByEndpoint(
  userId: string,
  endpoint: string,
): Promise<void> {
  await db
    .delete(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.endpoint, endpoint),
        eq(pushSubscriptions.userId, userId),
      ),
    );
}

/** A test push to every device, so "is this phone set up" has an answer. */
export async function sendTestNotification(userId: string) {
  return pushToUser(userId, {
    occurrenceId: crypto.randomUUID(),
    title: "Planner notifications are on",
    body: "Reminders will arrive here.",
    url: REMINDERS_PANEL_URL,
    completable: false,
  });
}
