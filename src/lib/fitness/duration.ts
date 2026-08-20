/**
 * Hold and carry durations. Seconds are the stored and typed unit — the set field is
 * numeric so the phone keypad appears — but `m:ss` parses too for desktop typing.
 */

/** A day. Anything longer is a typo, not a plank. */
const MAX_DURATION_SEC = 24 * 60 * 60;

/**
 * Normalise a typed duration: `"45"`, `"1:30"`, `"0:45"` → whole seconds.
 * Empty, malformed, zero, negative, fractional or absurd input → `null`.
 */
export function parseDurationSeconds(
  raw: string | number | null | undefined,
): number | null {
  if (raw === null || raw === undefined || raw === "") return null;

  if (typeof raw === "number") return clampWhole(raw);

  const text = raw.trim();
  if (text === "") return null;

  const colon = text.indexOf(":");
  if (colon === -1) return clampWhole(Number(text));

  const minutes = Number(text.slice(0, colon).trim() || "0");
  const seconds = Number(text.slice(colon + 1).trim());
  if (!Number.isInteger(minutes) || !Number.isInteger(seconds)) return null;
  if (minutes < 0 || seconds < 0 || seconds > 59) return null;

  return clampWhole(minutes * 60 + seconds);
}

function clampWhole(value: number): number | null {
  if (!Number.isFinite(value) || !Number.isInteger(value)) return null;
  if (value <= 0 || value > MAX_DURATION_SEC) return null;
  return value;
}

/** `m:ss` clock, for the running stopwatch and the hint under a long duration. */
export function formatDurationClock(seconds: number): string {
  const total = Math.max(0, Math.ceil(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Compact form for history labels: `"45s"` under a minute, `"1:30"` at or above, where
 * the bare seconds read better than a leading `0:`.
 */
export function formatDurationToken(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  return total < 60 ? `${total}s` : formatDurationClock(total);
}

/** Whole seconds elapsed since a wall-clock instant. Never negative. */
export function elapsedSince(startedAtMs: number, nowMs: number): number {
  return Math.max(0, Math.floor((nowMs - startedAtMs) / 1000));
}
