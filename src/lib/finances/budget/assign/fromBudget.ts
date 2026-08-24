/**
 * Turn the budget page's already-folded data into `planAssign` inputs, so the preview
 * is the same function the mutation writes — not a second estimate.
 *
 * Spec: `agent-os/specs/2026-08-24-1311-budget-assign-options/` Task 3.
 */

import { categoryMonth, type BudgetMonth } from "../envelope";
import type { BudgetRow } from "../rows";
import type { BillSnapshot } from "../templates/schedule";
import { templateCarryIn } from "../templates/apply";
import type { AssignEnvelope, AssignHistoryMonth } from "./types";

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
    templates: row.templates,
    assignedCents: row.assignedCents,
    activityCents: row.activityCents,
    balanceCents: row.balanceCents,
    carryInCents: templateCarryIn(prior),
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
