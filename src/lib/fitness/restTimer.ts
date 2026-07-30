/** Pure rest-timer helpers — countdown math and formatting, no React. */

export const REST_PRESETS_SEC = [60, 90, 120, 180] as const;
export const DEFAULT_REST_SEC = 90;
export const MIN_REST_SEC = 15;
export const MAX_REST_SEC = 30 * 60;
export const REST_NUDGE_SEC = 15;

export function clampRestDuration(seconds: number): number {
  if (!Number.isFinite(seconds)) return DEFAULT_REST_SEC;
  return Math.min(MAX_REST_SEC, Math.max(MIN_REST_SEC, Math.round(seconds)));
}

/** `m:ss` countdown display. Accepts fractional remaining and ceils so 0.1 → 1. */
export function formatRestClock(remainingSec: number): string {
  const s = Math.max(0, Math.ceil(remainingSec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

export function nudgeRestDuration(current: number, direction: 1 | -1): number {
  return clampRestDuration(current + direction * REST_NUDGE_SEC);
}

/**
 * Remaining seconds given wall-clock end time. Negative means overdue (treat as 0).
 */
export function remainingUntil(endsAtMs: number, nowMs: number): number {
  return Math.max(0, (endsAtMs - nowMs) / 1000);
}
