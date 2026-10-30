"use client";

/**
 * The browser half of Web Push: the service worker, permission, and this device's
 * subscription. Browser APIs only — what is stored about a subscription is the server's.
 */

export const SERVICE_WORKER_URL = "/sw.js";

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/**
 * iOS delivers Web Push only to a Home Screen app (16.4+). In Safari proper the APIs are
 * missing or inert, and the honest thing to say is how to get to the place where they work.
 */
export function needsHomeScreenInstall(): boolean {
  if (typeof window === "undefined") return false;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return ios && !standalone;
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!pushSupported()) return null;
  try {
    return await navigator.serviceWorker.register(SERVICE_WORKER_URL, { scope: "/" });
  } catch (error) {
    console.error("[reminders] service worker registration failed", error);
    return null;
  }
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  const registration =
    await navigator.serviceWorker.getRegistration(SERVICE_WORKER_URL);
  return (await registration?.pushManager.getSubscription()) ?? null;
}

/** VAPID public keys are base64url; `subscribe` wants the raw bytes. */
function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const padded = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/** A name for the device list: "iPhone", "Chrome on macOS". */
export function deviceLabel(): string {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Android/.test(ua)) return "Android";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Firefox\//.test(ua)
      ? "Firefox"
      : /Chrome\//.test(ua)
        ? "Chrome"
        : /Safari\//.test(ua)
          ? "Safari"
          : "Browser";
  const os = /Mac OS X/.test(ua)
    ? "macOS"
    : /Windows/.test(ua)
      ? "Windows"
      : /Linux/.test(ua)
        ? "Linux"
        : "";
  return os ? `${browser} on ${os}` : browser;
}

export type SubscriptionKeys = {
  endpoint: string;
  p256dh: string;
  auth: string;
  label: string;
};

/**
 * Ask for permission and subscribe this browser. Must run from a tap — iOS refuses a
 * permission prompt that no gesture asked for.
 */
export async function subscribeThisDevice(
  vapidPublicKey: string,
): Promise<SubscriptionKeys> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error(
      permission === "denied"
        ? "Notifications are blocked for Planner in this browser's settings."
        : "Notifications were not allowed.",
    );
  }
  const registration =
    (await registerServiceWorker()) ?? (await navigator.serviceWorker.ready);
  await navigator.serviceWorker.ready;
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyBytes(vapidPublicKey),
    }));
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) {
    throw new Error("This browser returned an incomplete push subscription.");
  }
  return {
    endpoint: json.endpoint,
    p256dh: json.keys.p256dh,
    auth: json.keys.auth,
    label: deviceLabel(),
  };
}

/** Drop this browser's subscription; returns the endpoint it had, for the server to forget. */
export async function unsubscribeThisDevice(): Promise<string | null> {
  const subscription = await currentSubscription();
  if (!subscription) return null;
  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  return endpoint;
}
