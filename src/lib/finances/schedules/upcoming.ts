/**
 * Unposted upcoming occurrences, for the Register strip.
 *
 * These are **not transactions**. They must not reach any balance, Available to Spend
 * figure, or budget number — the type is deliberately not `TransactionListRow`.
 */

import { shiftDateKey } from "@/lib/schedule/geometry";
import {
  dateConfigOf,
  extractScheduleConds,
  getScheduledAmount,
  type ScheduleCondition,
} from "./conditions";
import { matchStartDate } from "./match";
import { occurrences } from "./recur";
import { getUpcomingDays } from "./status";

export type UpcomingOccurrence = {
  scheduleId: string;
  name: string;
  date: string;
  amountCents: number;
};

export type UpcomingSchedule = {
  id: string;
  name: string;
  nextDate: string;
  completed: boolean;
  postsTransaction: boolean;
  customUpcomingLength: string | null;
  conditions: readonly ScheduleCondition[];
};

export type PostedLink = {
  scheduleId: string;
  date: string;
};

function alreadyPosted(
  schedule: UpcomingSchedule,
  occurrenceDate: string,
  posted: readonly PostedLink[],
): boolean {
  const conds = extractScheduleConds([...schedule.conditions]);
  const start = matchStartDate(conds, occurrenceDate, schedule.postsTransaction);
  return posted.some(
    (row) =>
      row.scheduleId === schedule.id && row.date >= start && row.date <= occurrenceDate,
  );
}

/**
 * Unposted occurrences from `today` through each schedule's horizon, in date order.
 *
 * Completed schedules contribute nothing. The horizon is the register setting, overridden
 * per schedule by `customUpcomingLength`.
 */
export function upcomingOccurrences(
  schedules: readonly UpcomingSchedule[],
  posted: readonly PostedLink[],
  horizon: string,
  today: string,
): UpcomingOccurrence[] {
  const rows: UpcomingOccurrence[] = [];
  for (const schedule of schedules) {
    if (schedule.completed) continue;
    const conds = extractScheduleConds([...schedule.conditions]);
    const config = dateConfigOf(conds.date);
    if (!config) continue;
    const length = schedule.customUpcomingLength ?? horizon;
    const end = shiftDateKey(today, getUpcomingDays(length, today));
    if (end < today) continue;
    const amountCents = getScheduledAmount(conds.amount);
    const dates = occurrences(
      config,
      schedule.nextDate < today ? today : schedule.nextDate,
      12,
    );
    for (const date of dates) {
      if (date < today || date > end) continue;
      if (alreadyPosted(schedule, date, posted)) continue;
      rows.push({
        scheduleId: schedule.id,
        name: schedule.name,
        date,
        amountCents,
      });
    }
  }
  return rows.sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : a.name.localeCompare(b.name),
  );
}
