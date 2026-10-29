"use server";

import {
  run,
  runQuery,
  runWithData,
  type ActionResult,
  type DataActionResult,
  type QueryResult,
} from "@/app/actionResult";
import { armHorizon } from "@/lib/reminders/arm";
import {
  removePushSubscription,
  removePushSubscriptionByEndpoint,
  savePushSubscription,
  sendTestNotification,
  type PushSubscriptionInput,
} from "@/lib/reminders/mutations";
import { vapidPublicKey, type PushOutcome } from "@/lib/reminders/push";
import {
  listPushDevices,
  loadNotificationPrefs,
  type PushDevice,
} from "@/lib/reminders/queries";
import {
  parseNotificationPrefs,
  serializeNotificationPrefs,
  type NotificationPrefs,
} from "@/lib/settings/notifications";
import { writeUserSetting } from "@/lib/settings/mutations";
import { NOTIFICATIONS_SCOPE } from "@/lib/settings/scopes";

/**
 * Server actions behind Settings → Notifications. None of them changes anything a page shows,
 * so none revalidates.
 */

export type NotificationSettings = {
  prefs: NotificationPrefs;
  devices: Omit<PushDevice, "endpoint">[];
  /** Null when the server has no VAPID keys, and so cannot push at all. */
  vapidPublicKey: string | null;
  /** The endpoints of this user's devices, so a browser can tell whether it is one. */
  endpoints: string[];
};

export async function loadNotificationSettingsAction(): Promise<
  QueryResult<NotificationSettings>
> {
  return runQuery(async (userId) => {
    const [prefs, devices] = await Promise.all([
      loadNotificationPrefs(userId),
      listPushDevices(userId),
    ]);
    return {
      prefs,
      devices: devices.map(({ endpoint: _endpoint, ...device }) => device),
      vapidPublicKey: vapidPublicKey(),
      endpoints: devices.map((device) => device.endpoint),
    };
  });
}

/**
 * Save the preferences and re-arm the week ahead with them, so switching project blocks on
 * arms today's rather than tomorrow morning's.
 */
export async function saveNotificationPrefsAction(
  prefs: NotificationPrefs,
): Promise<ActionResult> {
  return run(
    async (userId) => {
      const clean = parseNotificationPrefs(prefs);
      await writeUserSetting(
        userId,
        NOTIFICATIONS_SCOPE,
        serializeNotificationPrefs(clean),
      );
      await armHorizon(userId);
    },
    { revalidate: [] },
  );
}

export async function subscribeDeviceAction(
  input: PushSubscriptionInput,
): Promise<ActionResult> {
  return run((userId) => savePushSubscription(userId, input), { revalidate: [] });
}

export async function removeDeviceAction(id: string): Promise<ActionResult> {
  return run((userId) => removePushSubscription(userId, id), { revalidate: [] });
}

export async function unsubscribeEndpointAction(
  endpoint: string,
): Promise<ActionResult> {
  return run((userId) => removePushSubscriptionByEndpoint(userId, endpoint), {
    revalidate: [],
  });
}

export async function sendTestNotificationAction(): Promise<
  DataActionResult<PushOutcome>
> {
  return runWithData((userId) => sendTestNotification(userId), { revalidate: [] });
}
