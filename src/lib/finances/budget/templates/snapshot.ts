/**
 * Schedule records reduced to what the template math needs.
 *
 * A schedule's amount and recurrence live inside its `conditions` JSON, so every caller that
 * wants to know what a schedule will cost has to parse the same three fields. Extracted here
 * once because two callers want it: `applyBudgetTemplates` on the server, and the budget page,
 * which hands the same snapshots to the drawer so its preview runs the real engine rather than
 * an approximation of it.
 *
 * A schedule with no usable date condition is dropped: there is nothing to project from, and
 * the template that names it reports its own error (`schedule.ts`).
 */

import {
  dateConfigOf,
  extractScheduleConds,
  getScheduledAmount,
} from "../../schedules/conditions";
import type { ScheduleRecord } from "../../schedules/queries";
import type { ScheduleSnapshot } from "./schedule";

export function scheduleSnapshots(
  records: readonly ScheduleRecord[],
): ScheduleSnapshot[] {
  const snapshots: ScheduleSnapshot[] = [];
  for (const record of records) {
    const conds = extractScheduleConds(record.conditions);
    const config = dateConfigOf(conds.date);
    if (!config) continue;
    snapshots.push({
      id: record.id,
      name: record.name,
      completed: record.completed,
      amountCents: getScheduledAmount(conds.amount),
      nextDate: record.nextDate,
      config,
    });
  }
  return snapshots;
}

export function scheduleSnapshotMap(
  snapshots: readonly ScheduleSnapshot[],
): Map<string, ScheduleSnapshot> {
  return new Map(snapshots.map((snapshot) => [snapshot.id, snapshot]));
}
