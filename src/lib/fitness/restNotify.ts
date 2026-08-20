/**
 * When rest is done, and whether to ask the browser first. Pure — RestTimer owns the
 * Notification calls, the same way it owns the beep.
 */

export type NotifyPermission = "default" | "granted" | "denied" | "unsupported";

export const REST_DONE_TITLE = "Rest done";
export const REST_DONE_BODY = "Time for the next set.";
export const REST_DONE_TAG = "planner-rest-done";
export const REST_DONE_ICON = "/icons/icon-192.png";

/**
 * Missing API → unsupported. An unrecognised permission string is also unsupported, never
 * granted — treating a stranger as "yes" would fire banners the user did not allow.
 */
export function readNotifyPermission(
  notification: { permission: string } | null | undefined,
): NotifyPermission {
  if (notification == null) return "unsupported";
  const { permission } = notification;
  if (permission === "default" || permission === "granted" || permission === "denied") {
    return permission;
  }
  return "unsupported";
}

/** Ask only while the browser has not heard an answer. Granted and denied stay silent. */
export function shouldRequestPermission(permission: NotifyPermission): boolean {
  return permission === "default";
}

/** A banner is allowed only after an explicit grant. */
export function shouldShowBanner(permission: NotifyPermission): boolean {
  return permission === "granted";
}

export function restDonePayload(): {
  title: string;
  body: string;
  tag: string;
  icon: string;
} {
  return {
    title: REST_DONE_TITLE,
    body: REST_DONE_BODY,
    tag: REST_DONE_TAG,
    icon: REST_DONE_ICON,
  };
}
