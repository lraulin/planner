import type { BackupGeneration } from "./generations";

const DAY_MS = 24 * 60 * 60 * 1_000;

export interface RetentionPlan {
  keep: BackupGeneration[];
  prune: BackupGeneration[];
}

/**
 * Keep the newest generation in every eligible bucket. The tiers overlap deliberately:
 * today's daily can also be this week's and this month's representative.
 */
export function planRetention(
  generations: BackupGeneration[],
  now: Date,
): RetentionPlan {
  const ordered = [...generations].sort(
    (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
  );
  const usedDays = new Set<string>();
  const usedWeeks = new Set<string>();
  const usedMonths = new Set<string>();
  const keepNames = new Set<string>();

  for (const generation of ordered) {
    if (generation.createdAt.getTime() > now.getTime()) {
      keepNames.add(generation.fileName);
      continue;
    }

    const dayAge = utcDayAge(generation.createdAt, now);
    const weekAge = isoWeekAge(generation.createdAt, now);
    const monthAge = utcMonthAge(generation.createdAt, now);
    const day = utcDayKey(generation.createdAt);
    const week = isoWeekKey(generation.createdAt);
    const month = utcMonthKey(generation.createdAt);

    if (dayAge >= 0 && dayAge < 14 && !usedDays.has(day)) {
      usedDays.add(day);
      keepNames.add(generation.fileName);
    }
    if (weekAge >= 0 && weekAge < 8 && !usedWeeks.has(week)) {
      usedWeeks.add(week);
      keepNames.add(generation.fileName);
    }
    if (monthAge >= 0 && monthAge < 12 && !usedMonths.has(month)) {
      usedMonths.add(month);
      keepNames.add(generation.fileName);
    }
  }

  return {
    keep: ordered.filter((generation) => keepNames.has(generation.fileName)),
    prune: ordered.filter((generation) => !keepNames.has(generation.fileName)),
  };
}

export function isoWeekKey(value: Date): string {
  const thursday = startOfUtcDay(value);
  const day = thursday.getUTCDay() || 7;
  thursday.setUTCDate(thursday.getUTCDate() + 4 - day);
  const isoYear = thursday.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  const firstDay = firstThursday.getUTCDay() || 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() + 4 - firstDay);
  const week =
    1 + Math.round((thursday.getTime() - firstThursday.getTime()) / (7 * DAY_MS));
  return `${isoYear}-W${week.toString().padStart(2, "0")}`;
}

function utcDayAge(value: Date, now: Date): number {
  return Math.floor(
    (startOfUtcDay(now).getTime() - startOfUtcDay(value).getTime()) / DAY_MS,
  );
}

function isoWeekAge(value: Date, now: Date): number {
  return Math.floor(
    (startOfIsoWeek(now).getTime() - startOfIsoWeek(value).getTime()) / (7 * DAY_MS),
  );
}

function utcMonthAge(value: Date, now: Date): number {
  return (
    now.getUTCFullYear() * 12 +
    now.getUTCMonth() -
    (value.getUTCFullYear() * 12 + value.getUTCMonth())
  );
}

function utcDayKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function utcMonthKey(value: Date): string {
  return value.toISOString().slice(0, 7);
}

function startOfUtcDay(value: Date): Date {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );
}

function startOfIsoWeek(value: Date): Date {
  const result = startOfUtcDay(value);
  const day = result.getUTCDay() || 7;
  result.setUTCDate(result.getUTCDate() - day + 1);
  return result;
}
