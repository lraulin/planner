/**
 * Pure helpers for week grids and Time Chart minute-of-day math.
 * No I/O — unit-tested like `src/lib/tree/derive.ts`.
 */

/** Snap a minute-of-day (or duration) to a grid step. Default 15 minutes. */
export function snapMinutes(value: number, step = 15): number {
  if (step <= 0) return value;
  return Math.round(value / step) * step;
}

/** Clamp start to 0..1439; duration at least `step` minutes. */
export function normalizeTimeRange(
  startMinute: number,
  durationMinutes: number,
  step = 15,
): { startMinute: number; durationMinutes: number } {
  const start = Math.max(0, Math.min(24 * 60 - step, snapMinutes(startMinute, step)));
  const duration = Math.max(step, snapMinutes(durationMinutes, step));
  return { startMinute: start, durationMinutes: duration };
}

/**
 * Calendar-day key (`YYYY-MM-DD`) for a **stored plan/record date**.
 *
 * Calendar fields are encoded as **UTC noon** of the intended day (`fromDateKey`), so this
 * reads **UTC** date components — not the process-local day. That is what stops a save on a
 * UTC server from turning "Aug 1" (client local midnight) into "Jul 31" after `startOfDay`.
 *
 * For "what day is it on the user's wall clock right now?" use `localDateKey`.
 * See `agent-os/standards/development/dates.md`.
 */
export function toDateKey(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Encode a `YYYY-MM-DD` calendar day for storage / wire.
 *
 * Uses **UTC noon** of that day (not local midnight, not UTC midnight). Local midnight is
 * a different instant on the server than on the laptop; UTC midnight displays as the
 * previous evening in the Americas. Noon UTC keeps the same `toDateKey` on every machine.
 *
 * Never `new Date("YYYY-MM-DD")` (UTC midnight) and never `new Date(y, m - 1, d)` in shared
 * code (process-local midnight).
 */
export function fromDateKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
}

/**
 * Local wall-clock calendar day of an **instant** (completion time, "now").
 *
 * Only for user-facing "today" and max-date on pickers — not for reading stored plan dates.
 */
export function localDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Normalize any Date to the stored encoding of its calendar day (`fromDateKey(toDateKey)`). */
export function asCalendarDay(date: Date): Date {
  return fromDateKey(toDateKey(date));
}

/**
 * Whole days from `from` to `to`, both `YYYY-MM-DD` keys.
 *
 * Pure string arithmetic at UTC midnight so DST cannot shift a boundary. Safe because the
 * inputs are already day *labels*, not instants — do not use this on `toISOString()` output
 * from a local-midnight Date; convert with `toDateKey` first.
 */
export function daysBetweenKeys(from: string, to: string): number {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / MS_PER_DAY,
  );
}

/**
 * Shift a `YYYY-MM-DD` key by whole calendar days without going through local Date getters.
 * Used for day-page navigation where the key is a label, not a timezone-aware instant.
 */
export function shiftDateKey(key: string, days: number): string {
  const ms = Date.parse(`${key}T00:00:00Z`) + days * 24 * 60 * 60 * 1000;
  return new Date(ms).toISOString().slice(0, 10);
}

/** Start of the week containing `date`. `weekStartsOn`: 0=Sun (Achieve default). */
export function startOfWeek(date: Date, weekStartsOn = 0): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay();
  const diff = (day - weekStartsOn + 7) % 7;
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Seven local midnights starting at `weekStart`. */
export function weekDays(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });
}

/** Build a Date from a local day + minutes from midnight. */
export function atMinutes(day: Date, minute: number): Date {
  return new Date(
    day.getFullYear(),
    day.getMonth(),
    day.getDate(),
    Math.floor(minute / 60),
    minute % 60,
    0,
    0,
  );
}

/**
 * Weekday of a `YYYY-MM-DD` key: 0=Sun…6=Sat.
 *
 * Reads UTC components of the UTC-noon encoding, so the answer does not depend on the
 * process timezone. `new Date(key).getDay()` would — UTC midnight of a Sunday is Saturday
 * evening in the Americas.
 */
export function weekdayOfDateKey(key: string): number {
  return fromDateKey(key).getUTCDay();
}

const MINUTES_IN_DAY = 24 * 60;

/**
 * Floating local datetime `YYYY-MM-DDTHH:mm:00` for a day key plus minutes from midnight.
 *
 * Not an instant: there is no `Z` and no offset. Time Chart areas are wall-clock ("9am
 * every weekday"), and baking them into a `Date` on the server stamps the *server's*
 * zone. On Vercel that is UTC, so a 9am block becomes 5am Eastern on the calendar.
 * Minutes past 24:00 roll into the next key.
 */
export function floatingDateTime(dayKey: string, minute: number): string {
  const dayShift = Math.floor(minute / MINUTES_IN_DAY);
  const mins = ((minute % MINUTES_IN_DAY) + MINUTES_IN_DAY) % MINUTES_IN_DAY;
  const key = dayShift === 0 ? dayKey : shiftDateKey(dayKey, dayShift);
  const hours = Math.floor(mins / 60);
  const minutes = mins % 60;
  return `${key}T${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00`;
}

/**
 * Read a floating `YYYY-MM-DDTHH:mm[:ss]` as a process-local instant.
 *
 * Pair of `floatingDateTime`: the server sends the wall-clock string, and the client
 * (whose zone is the user's) turns it into a `Date` FullCalendar can place. Do not use
 * `new Date(iso)` — a missing offset is implementation-defined, and an ISO-with-Z from
 * a leftover instant would shift by the server's offset.
 */
export function parseFloatingDateTime(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(value);
  if (!match) return new Date(Number.NaN);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hours = Number(match[4]);
  const minutes = Number(match[5]);
  const seconds = Number(match[6] ?? 0);
  return new Date(year, month - 1, day, hours, minutes, seconds, 0);
}

/** Minutes from local midnight. */
export function minutesOfDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

export const WEEKDAY_LABELS = [
  "Sun",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
] as const;

export const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;
export const WEEKDAYS_ONLY = [1, 2, 3, 4, 5] as const;

export function sortDays(days: number[]): number[] {
  return [...new Set(days.filter((d) => d >= 0 && d <= 6))].sort((a, b) => a - b);
}

/**
 * Pick near-white or near-black label text for a CSS color so Time Chart labels stay
 * readable on arbitrary area fills (and when FullCalendar ignores `textColor`).
 */
export function contrastText(cssColor: string): string {
  const rgb = parseCssColor(cssColor);
  if (!rgb) return "#1b1d23";
  // Relative luminance (sRGB), WCAG-ish.
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return L < 0.45 ? "#f5f5f7" : "#1b1d23";
}

function parseCssColor(input: string): [number, number, number] | null {
  const s = input.trim();
  const hex = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) {
      h = h
        .split("")
        .map((c) => c + c)
        .join("");
    }
    return [
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16),
    ];
  }
  const rgb = s.match(
    /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*[\d.]+\s*)?\)$/i,
  );
  if (rgb) {
    return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  }
  return null;
}
