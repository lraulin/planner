import { and, eq, inArray } from "drizzle-orm";
import webpush from "web-push";
import { db } from "@/db";
import { pushSubscriptions, type ReminderSourceKind } from "@/db/schema";

/**
 * Web Push delivery to every device a user has subscribed.
 *
 * VAPID keys come from `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT`. Without
 * them nothing is sent and the panel still lists what fired — push is how a reminder reaches
 * a closed app, not what makes it exist.
 */

export type ReminderPayload = {
  occurrenceId: string;
  title: string;
  body: string;
  /** Opens the app with the Reminders panel showing. */
  url: string;
  /** Whether the notification may offer Complete (tasks, projects, appointments). */
  completable: boolean;
};

export const REMINDERS_PANEL_URL = "/?reminders=open";

export function isCompletable(kind: ReminderSourceKind): boolean {
  return kind === "task" || kind === "project" || kind === "appointment";
}

export function vapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY?.trim() || null;
}

function vapidDetails() {
  const publicKey = vapidPublicKey();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim();
  if (!publicKey || !privateKey || !subject) return null;
  return { publicKey, privateKey, subject };
}

export type PushOutcome = { sent: number; pruned: number; failed: number };

/**
 * Send one payload to all of a user's devices.
 *
 * A 404 or 410 from the push service means the subscription is gone for good (the app was
 * removed, permission was revoked) and its row is deleted; anything else is a transient
 * failure and the row is kept.
 */
export async function pushToUser(
  userId: string,
  payload: ReminderPayload,
): Promise<PushOutcome> {
  const vapid = vapidDetails();
  const outcome: PushOutcome = { sent: 0, pruned: 0, failed: 0 };
  if (!vapid) {
    console.info("[reminders] VAPID keys unset; not pushing", payload.occurrenceId);
    return outcome;
  }

  const devices = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId));
  if (devices.length === 0) return outcome;

  const body = JSON.stringify(payload);
  const gone: string[] = [];
  const delivered: string[] = [];

  await Promise.all(
    devices.map(async (device) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: device.endpoint,
            keys: { p256dh: device.p256dh, auth: device.auth },
          },
          body,
          {
            vapidDetails: vapid,
            // A reminder an hour late is noise; let the push service drop it instead.
            TTL: 60 * 60,
            urgency: "high",
            topic: payload.occurrenceId.replace(/-/g, "").slice(0, 32),
          },
        );
        delivered.push(device.id);
      } catch (error) {
        const status = (error as { statusCode?: unknown }).statusCode;
        if (status === 404 || status === 410) {
          gone.push(device.id);
        } else {
          outcome.failed += 1;
          console.error("[reminders] push failed", device.id, status, error);
        }
      }
    }),
  );

  if (gone.length > 0) {
    await db
      .delete(pushSubscriptions)
      .where(
        and(eq(pushSubscriptions.userId, userId), inArray(pushSubscriptions.id, gone)),
      );
  }
  if (delivered.length > 0) {
    await db
      .update(pushSubscriptions)
      .set({ lastSuccessAt: new Date() })
      .where(
        and(
          eq(pushSubscriptions.userId, userId),
          inArray(pushSubscriptions.id, delivered),
        ),
      );
  }

  outcome.sent = delivered.length;
  outcome.pruned = gone.length;
  return outcome;
}
