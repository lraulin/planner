/**
 * Turn the budget page's already-folded data into `planAssign` inputs, so the preview
 * is the same function the mutation writes — not a second estimate.
 *
 * Spec: `agent-os/specs/2026-08-24-1311-budget-assign-options/` Task 3.
 */

import {
  categoryMonth,
  findMonth,
  monthKeyOf,
  prevMonthKey,
  shiftMonthKey,
  type BudgetMonth,
  type MonthKey,
} from "../envelope";
import { budgetRows, type BudgetRow } from "../rows";
import { underfundedGapCents } from "./plan";
import type { BillSnapshot } from "../targets/derive";
import { templateCarryIn } from "../templates/apply";
import {
  ASSIGN_AVERAGE_MONTHS,
  type AssignEnvelope,
  type AssignHistoryMonth,
} from "./types";

export type ActivityPoint = {
  month: MonthKey;
  categoryId: string;
  amountCents: number;
};

export function assignEnvelopeFromRow(
  row: BudgetRow,
  previous: BudgetMonth | null,
): AssignEnvelope {
  const prior = previous ? categoryMonth(previous, row.id) : null;
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    hidden: row.hidden,
    status: row.bill?.status ?? "active",
    target: row.target,
    assignedCents: row.assignedCents,
    activityCents: row.activityCents,
    balanceCents: row.balanceCents,
    carryInCents: templateCarryIn(prior),
    snoozed: row.snoozed,
    nextDueKey: row.nextDueKey,
  };
}

export function billSnapshotFromRow(row: BudgetRow): BillSnapshot | null {
  if (row.kind !== "bill" || !row.bill || row.bill.status !== "active") return null;
  if (row.bill.cadenceMonths === null || row.bill.expectedCents === null) return null;
  if (!row.nextDueKey) return null;
  return {
    id: row.id,
    name: row.name,
    cadenceMonths: row.bill.cadenceMonths,
    cadenceDays: row.bill.cadenceDays,
    expectedCents: row.bill.expectedCents,
    nextDueKey: row.nextDueKey,
    expectedKey: row.expectedKey,
  };
}

export function assignHistoryFromMonths(
  months: readonly BudgetMonth[],
  categoryIds: readonly string[],
): AssignHistoryMonth[] {
  return months.map((month) => {
    const assigned: Record<string, number> = {};
    const activity: Record<string, number> = {};
    for (const id of categoryIds) {
      const cell = categoryMonth(month, id);
      assigned[id] = cell.assignedCents;
      activity[id] = cell.activityCents;
    }
    return { month: month.month, assigned, activity };
  });
}

/**
 * Calendar months before the budget start, with Assigned at 0.
 *
 * Spent Last Month / Average Spent need this; Average Assigned does not invent
 * Assigned that was never written.
 */
export function preStartAssignHistory(
  startMonth: MonthKey,
  categoryIds: readonly string[],
  activity: readonly ActivityPoint[],
  lookbackMonths: number = ASSIGN_AVERAGE_MONTHS,
): AssignHistoryMonth[] {
  const byMonth = new Map<string, Record<string, number>>();
  for (const point of activity) {
    if (point.month >= startMonth) continue;
    const bucket = byMonth.get(point.month) ?? {};
    bucket[point.categoryId] = (bucket[point.categoryId] ?? 0) + point.amountCents;
    byMonth.set(point.month, bucket);
  }

  const months: AssignHistoryMonth[] = [];
  for (let offset = lookbackMonths; offset >= 1; offset -= 1) {
    const month = shiftMonthKey(startMonth, -offset);
    const spent = byMonth.get(month) ?? {};
    const assigned: Record<string, number> = {};
    const activityCents: Record<string, number> = {};
    for (const id of categoryIds) {
      assigned[id] = 0;
      activityCents[id] = spent[id] ?? 0;
    }
    months.push({ month, assigned, activity: activityCents });
  }
  return months;
}

export function assignHistoryWithLookback(
  months: readonly BudgetMonth[],
  categoryIds: readonly string[],
  preStartActivity: readonly ActivityPoint[],
  startMonth: MonthKey | null,
): AssignHistoryMonth[] {
  const folded = assignHistoryFromMonths(months, categoryIds);
  if (!startMonth) return folded;
  return [
    ...preStartAssignHistory(startMonth, categoryIds, preStartActivity),
    ...folded,
  ];
}

export function isFutureBudgetMonth(viewed: MonthKey, todayKey: string): boolean {
  return viewed > monthKeyOf(todayKey);
}

export function currentMonthUnderfundedGap(params: {
  months: readonly BudgetMonth[];
  todayKey: string;
  groups: Parameters<typeof budgetRows>[0];
  categories: Parameters<typeof budgetRows>[1];
  goals: Parameters<typeof budgetRows>[3];
  anchors: Parameters<typeof budgetRows>[4];
}): number {
  const currentKey = monthKeyOf(params.todayKey);
  const current = findMonth(params.months, currentKey);
  if (!current) return 0;
  const previous = findMonth(params.months, prevMonthKey(currentKey));
  const rows = budgetRows(
    params.groups,
    params.categories,
    current,
    params.goals,
    params.anchors,
  );
  return underfundedGapCents(
    currentKey,
    rows.map((row) => assignEnvelopeFromRow(row, previous)),
    assignBillsFromRows(rows),
  );
}

/** The same Assign envelopes the Budget grid scans, for any already-folded month. */
export function assignScanInputs(params: {
  month: BudgetMonth;
  previous: BudgetMonth | null;
  groups: Parameters<typeof budgetRows>[0];
  categories: Parameters<typeof budgetRows>[1];
  goals?: Parameters<typeof budgetRows>[3];
  anchors?: Parameters<typeof budgetRows>[4];
}): { envelopes: AssignEnvelope[]; bills: Map<string, BillSnapshot> } {
  const rows = budgetRows(
    params.groups,
    params.categories,
    params.month,
    params.goals ?? {},
    params.anchors ?? new Map(),
  );
  return {
    envelopes: rows.map((row) => assignEnvelopeFromRow(row, params.previous)),
    bills: assignBillsFromRows(rows),
  };
}

export function assignBillsFromRows(
  rows: readonly BudgetRow[],
): Map<string, BillSnapshot> {
  const bills = new Map<string, BillSnapshot>();
  for (const row of rows) {
    const snapshot = billSnapshotFromRow(row);
    if (snapshot) bills.set(row.id, snapshot);
  }
  return bills;
}
