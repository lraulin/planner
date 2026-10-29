import { shiftDateKey, zonedDateKey } from "./geometry";

/**
 * Wall-clock time in a named zone, for server code that has to place an **instant** on a
 * reader's calendar: "9:00 the day before the deadline", "tomorrow morning".
 *
 * `setHours` cannot do this on the server — Vercel runs in UTC, so a 9:00 reminder would land
 * at 5:00 Eastern (the Time Chart bug in `development/dates.md`). And a fixed offset cannot do
 * it either, because the offset itself changes twice a year: 9:00 on the Monday after the
 * clocks go back is a different UTC hour from 9:00 on the Friday before.
 */

const MS_MINUTE = 60_000;

/** Wall clock minus UTC, in ms, at `instant` in `timeZone` (−4 h for New York in summer). */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
  }).formatToParts(instant);
  const part = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const wallAsUtc = Date.UTC(
    part("year"),
    part("month") - 1,
    part("day"),
    part("hour"),
    part("minute"),
  );
  // Seconds are not formatted, so compare at minute precision on both sides.
  return wallAsUtc - Math.floor(instant.getTime() / MS_MINUTE) * MS_MINUTE;
}

/**
 * The instant at which `timeZone`'s clocks read `minuteOfDay` on `dayKey`.
 *
 * Two passes because the offset to subtract is the one in force at the *answer*, which is not
 * known until there is an answer. In the spring-forward gap (2:30 on the day 2:00 becomes
 * 3:00) no such instant exists and this lands an hour later, which is what a clock that
 * skipped would show; in the fall-back hour, whichever reading comes first.
 */
export function zonedWallTime(
  dayKey: string,
  minuteOfDay: number,
  timeZone: string,
): Date {
  const [year, month, day] = dayKey.split("-").map(Number);
  const wallAsUtc = Date.UTC(year, month - 1, day, 0, minuteOfDay);
  const first = wallAsUtc - zoneOffsetMs(new Date(wallAsUtc), timeZone);
  const second = wallAsUtc - zoneOffsetMs(new Date(first), timeZone);
  return new Date(second);
}

/** Minutes past midnight on `timeZone`'s clock at `instant`. */
export function zonedMinuteOfDay(instant: Date, timeZone: string): number {
  const offset = zoneOffsetMs(instant, timeZone);
  const wall = new Date(instant.getTime() + offset);
  return wall.getUTCHours() * 60 + wall.getUTCMinutes();
}

/**
 * The same wall-clock time `days` calendar days later in `timeZone`.
 *
 * Whole days, not `days × 24 h`: a 9:00 reminder moved across a daylight-saving change stays
 * at 9:00 rather than drifting to 8:00 or 10:00.
 */
export function shiftZonedDays(instant: Date, days: number, timeZone: string): Date {
  return zonedWallTime(
    shiftDateKey(zonedDateKey(instant, timeZone), days),
    zonedMinuteOfDay(instant, timeZone),
    timeZone,
  );
}

/** `"09:00"` ↔ 540, for the time inputs that edit a minute-of-day setting. */
export function minuteOfDayLabel(minute: number): string {
  const hours = Math.floor(minute / 60);
  return `${String(hours).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

export function parseMinuteOfDay(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}
