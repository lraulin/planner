/**
 * Schedule status, copied from Actual's `getStatus` / `getUpcomingDays`
 * (`packages/loot-core/src/shared/schedules.ts`, MIT, © James Long).
 *
 * `today` is a parameter — no business rule may depend on the server clock
 * (`agent-os/standards/development/dates.md` rule 8).
 */

import { daysInMonth } from "@/lib/dateMath";
import { daysBetweenKeys, shiftDateKey } from "@/lib/schedule/geometry";

export const DEFAULT_UPCOMING_LENGTH = "7";

export const UPCOMING_LENGTH_PRESETS = [
  "1",
  "7",
  "14",
  "oneMonth",
  "currentMonth",
] as const;
export type UpcomingLengthPreset = (typeof UPCOMING_LENGTH_PRESETS)[number];

export const UPCOMING_LENGTH_LABELS: Record<UpcomingLengthPreset, string> = {
  "1": "1 day",
  "7": "1 week",
  "14": "2 weeks",
  oneMonth: "1 month",
  currentMonth: "End of the current month",
};

export type ScheduleStatus =
  "completed" | "paid" | "due" | "upcoming" | "missed" | "scheduled";

function monthEndKey(today: string): string {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  return `${today.slice(0, 8)}${String(daysInMonth(y, m)).padStart(2, "0")}`;
}

function nextMonthStart(today: string): string {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  return m === 12
    ? `${y + 1}-01-01`
    : `${String(y).padStart(4, "0")}-${String(m + 1).padStart(2, "0")}-01`;
}

/**
 * How many days the upcoming window covers from `today`.
 *
 * Actual's tokens: `'1'`/`'7'`/`'14'` are day counts; `oneMonth` is the length of the
 * current calendar month; `currentMonth` is days remaining in it.
 */
export function getUpcomingDays(upcomingLength: string, today: string): number {
  if (upcomingLength === "currentMonth") {
    return daysBetweenKeys(today, monthEndKey(today));
  }
  if (upcomingLength === "oneMonth") {
    return daysBetweenKeys(`${today.slice(0, 8)}01`, nextMonthStart(today));
  }
  const parsed = Number.parseInt(upcomingLength, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 7;
}

export function getStatus(
  nextDate: string,
  completed: boolean,
  hasTrans: boolean,
  upcomingLength: string,
  today: string,
): ScheduleStatus {
  if (completed) return "completed";
  if (hasTrans) return "paid";
  if (nextDate === today) return "due";
  const upcomingDays = getUpcomingDays(upcomingLength, today);
  const upcomingEnd = shiftDateKey(today, upcomingDays);
  if (nextDate > today && nextDate <= upcomingEnd) return "upcoming";
  if (nextDate < today) return "missed";
  return "scheduled";
}
