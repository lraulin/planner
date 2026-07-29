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

/** Local calendar day as YYYY-MM-DD. */
export function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Parse YYYY-MM-DD as local midnight. */
export function fromDateKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
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
