import { daysBetweenKeys, localDateKey } from "@/lib/schedule/geometry";

/** Whole local calendar days from `then` to `now`. Same day is 0. */
export function calendarDaysAgo(then: Date, now: Date = new Date()): number {
  return daysBetweenKeys(localDateKey(then), localDateKey(now));
}

export function formatDaysAgo(then: Date, now: Date = new Date()): string {
  const days = calendarDaysAgo(then, now);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}
