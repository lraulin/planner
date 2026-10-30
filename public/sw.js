/*
 * Planner's service worker — reminders only.
 *
 * It exists for Web Push: a reminder has to reach the iPhone with the app closed, and only a
 * service worker can receive a push then. It caches nothing and intercepts no fetches, so the
 * app behaves exactly as it did before it was installed.
 *
 * Spec: agent-os/specs/2026-10-28-2101-reminders-and-push-notifications/
 */

const PANEL_URL = "/?reminders=open";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

/** Tell every open window to re-read the Reminders panel. */
async function refreshClients(type) {
  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const client of windows) client.postMessage({ type });
}

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: "Planner", body: event.data ? event.data.text() : "" };
  }

  // Every push must show a notification — iOS revokes the subscription of an app whose
  // pushes stay silent — so even a malformed payload gets one.
  const title = payload.title || "Planner reminder";
  const options = {
    body: payload.body || "",
    tag: payload.occurrenceId || undefined,
    renotify: Boolean(payload.occurrenceId),
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: { url: payload.url || PANEL_URL, occurrenceId: payload.occurrenceId || null },
    // Shown where the browser supports actions (desktop Chrome). iOS ignores them, and a tap
    // opens the panel instead, which is where Complete lives on the phone.
    actions: payload.completable
      ? [
          { action: "complete", title: "Complete" },
          { action: "snooze", title: "Snooze 15 min" },
        ]
      : [{ action: "snooze", title: "Snooze 15 min" }],
  };

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, options),
      refreshClients("reminders:refresh"),
    ]),
  );
});

async function openPanel(url) {
  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  const open = windows.find((client) => "focus" in client);
  if (open) {
    await open.focus();
    open.postMessage({ type: "reminders:open" });
    return;
  }
  await self.clients.openWindow(url || PANEL_URL);
}

async function runAction(occurrenceId, action) {
  const response = await fetch(`/api/reminders/${encodeURIComponent(occurrenceId)}/action`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action }),
  });
  if (!response.ok) throw new Error(`Reminder action failed: ${response.status}`);
}

self.addEventListener("notificationclick", (event) => {
  const { url, occurrenceId } = event.notification.data || {};
  event.notification.close();

  if ((event.action === "complete" || event.action === "snooze") && occurrenceId) {
    event.waitUntil(
      runAction(occurrenceId, event.action)
        .then(() => refreshClients("reminders:refresh"))
        // Signed out, or the reminder was already dealt with elsewhere: show the panel, which
        // says what is actually left, rather than failing silently.
        .catch(() => openPanel(url)),
    );
    return;
  }

  event.waitUntil(openPanel(url));
});
