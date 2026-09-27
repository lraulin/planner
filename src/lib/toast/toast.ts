/**
 * Pure model behind the app-wide toast outlet. The React layer owns rendering and the clock;
 * everything that decides *which* toasts exist and *when* one expires lives here so it can be
 * tested without a DOM.
 */

export type ToastTone = "success" | "warning" | "error";

/** How many toasts are visible at once; pushing past this drops the oldest. */
export const MAX_VISIBLE_TOASTS = 3;

/** How long a success toast stays before it fades on its own. */
export const SUCCESS_LIFETIME_MS = 6000;

/** The queue is generic over what a toast displays, so this module never imports React. */
export type QueuedToast<T> = { id: number; tone: ToastTone; content: T };

/** Newest last, matching the on-screen order (newest at the bottom). */
export type ToastQueue<T> = readonly QueuedToast<T>[];

/** Only success fades. A warning or error is information the user has not yet acknowledged. */
export function autoExpires(tone: ToastTone): boolean {
  return tone === "success";
}

export function pushToast<T>(
  queue: ToastQueue<T>,
  toast: QueuedToast<T>,
): ToastQueue<T> {
  const next = [...queue, toast];
  return next.length > MAX_VISIBLE_TOASTS
    ? next.slice(next.length - MAX_VISIBLE_TOASTS)
    : next;
}

/** Dismissing an id that already dropped (cap, timer, double click) returns the same queue. */
export function dismissToast<T>(queue: ToastQueue<T>, id: number): ToastQueue<T> {
  return queue.some((t) => t.id === id) ? queue.filter((t) => t.id !== id) : queue;
}

/**
 * A pausable countdown. `runningSince` is null while paused, so the time left is
 * `remainingMs` minus however long it has run since the last (re)start.
 */
export type ToastTimer = { remainingMs: number; runningSince: number | null };

export function startTimer(
  now: number,
  durationMs: number = SUCCESS_LIFETIME_MS,
): ToastTimer {
  return { remainingMs: durationMs, runningSince: now };
}

export function timeLeft(timer: ToastTimer, now: number): number {
  if (timer.runningSince === null) return timer.remainingMs;
  return Math.max(0, timer.remainingMs - (now - timer.runningSince));
}

/** Freezing keeps what is left; it must not rewind to the full lifetime. */
export function pauseTimer(timer: ToastTimer, now: number): ToastTimer {
  if (timer.runningSince === null) return timer;
  return { remainingMs: timeLeft(timer, now), runningSince: null };
}

export function resumeTimer(timer: ToastTimer, now: number): ToastTimer {
  if (timer.runningSince !== null) return timer;
  return { remainingMs: timer.remainingMs, runningSince: now };
}
