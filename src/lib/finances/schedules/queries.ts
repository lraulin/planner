/**
 * Reads for Actual-style schedules. Every one takes `userId` and scopes on it.
 */

import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { financeAccounts, financeSchedules, financeTransactions } from "@/db/schema";
import { loadRecurringBills } from "@/lib/finances/dashboardQueries";
import { numericStringToCents } from "@/lib/finances/money";
import {
  extractScheduleConds,
  getScheduledAmount,
  parseConditions,
  payeeValues,
  type ScheduleCondition,
} from "./conditions";
import { billDrift, type BillDrift } from "./fromBill";
import { DEFAULT_UPCOMING_LENGTH, getStatus, type ScheduleStatus } from "./status";
import { matchStartDate } from "./match";
import type { DiscoverTx } from "./discover";
import { effectiveMerchant } from "@/lib/finances/analytics";

export type ScheduleRecord = {
  id: string;
  name: string;
  conditions: ScheduleCondition[];
  postsTransaction: boolean;
  completed: boolean;
  nextDate: string;
  customUpcomingLength: string | null;
  sourceBillId: string | null;
  sortKey: string;
};

export type ScheduleListRow = ScheduleRecord & {
  accountId: string | null;
  accountName: string | null;
  payeeLabel: string;
  amountCents: number;
  status: ScheduleStatus;
  drift: BillDrift | null;
  sourceBillName: string | null;
};

function parsedRecord(row: {
  id: string;
  name: string;
  conditions: unknown;
  postsTransaction: boolean;
  completed: boolean;
  nextDate: string;
  customUpcomingLength: string | null;
  sourceBillId: string | null;
  sortKey: string;
}): ScheduleRecord | null {
  const conditions = parseConditions(row.conditions);
  if (!conditions) return null;
  return { ...row, conditions };
}

export async function listScheduleRecords(userId: string): Promise<ScheduleRecord[]> {
  const rows = await db
    .select({
      id: financeSchedules.id,
      name: financeSchedules.name,
      conditions: financeSchedules.conditions,
      postsTransaction: financeSchedules.postsTransaction,
      completed: financeSchedules.completed,
      nextDate: financeSchedules.nextDate,
      customUpcomingLength: financeSchedules.customUpcomingLength,
      sourceBillId: financeSchedules.sourceBillId,
      sortKey: financeSchedules.sortKey,
    })
    .from(financeSchedules)
    .where(eq(financeSchedules.userId, userId))
    .orderBy(asc(financeSchedules.sortKey), asc(financeSchedules.name));

  return rows.flatMap((row) => {
    const parsed = parsedRecord(row);
    return parsed ? [parsed] : [];
  });
}

export async function getSchedule(
  userId: string,
  scheduleId: string,
): Promise<ScheduleRecord | null> {
  const [row] = await db
    .select({
      id: financeSchedules.id,
      name: financeSchedules.name,
      conditions: financeSchedules.conditions,
      postsTransaction: financeSchedules.postsTransaction,
      completed: financeSchedules.completed,
      nextDate: financeSchedules.nextDate,
      customUpcomingLength: financeSchedules.customUpcomingLength,
      sourceBillId: financeSchedules.sourceBillId,
      sortKey: financeSchedules.sortKey,
    })
    .from(financeSchedules)
    .where(
      and(eq(financeSchedules.id, scheduleId), eq(financeSchedules.userId, userId)),
    )
    .limit(1);
  return row ? parsedRecord(row) : null;
}

export async function listPostedLinks(
  userId: string,
  scheduleIds: readonly string[],
): Promise<{ scheduleId: string; date: string }[]> {
  if (scheduleIds.length === 0) return [];
  const rows = await db
    .select({
      scheduleId: financeTransactions.scheduleId,
      date: financeTransactions.transactionDate,
    })
    .from(financeTransactions)
    .where(
      and(
        eq(financeTransactions.userId, userId),
        inArray(financeTransactions.scheduleId, [...scheduleIds]),
      ),
    );
  return rows.flatMap((row) =>
    row.scheduleId ? [{ scheduleId: row.scheduleId, date: row.date }] : [],
  );
}

function hasTransFor(
  schedule: ScheduleRecord,
  links: readonly { scheduleId: string; date: string }[],
): boolean {
  const conds = extractScheduleConds(schedule.conditions);
  const start = matchStartDate(conds, schedule.nextDate, schedule.postsTransaction);
  return links.some(
    (row) =>
      row.scheduleId === schedule.id &&
      row.date >= start &&
      row.date <= schedule.nextDate,
  );
}

export async function listSchedules(
  userId: string,
  todayKey: string,
  horizon: string = DEFAULT_UPCOMING_LENGTH,
): Promise<ScheduleListRow[]> {
  const [records, bills, accounts] = await Promise.all([
    listScheduleRecords(userId),
    loadRecurringBills(userId),
    db
      .select({ id: financeAccounts.id, name: financeAccounts.name })
      .from(financeAccounts)
      .where(eq(financeAccounts.userId, userId)),
  ]);
  const links = await listPostedLinks(
    userId,
    records.map((row) => row.id),
  );
  const billsById = new Map(bills.map((bill) => [bill.id, bill]));
  const accountsById = new Map(accounts.map((account) => [account.id, account.name]));

  return records.map((record) => {
    const conds = extractScheduleConds(record.conditions);
    const accountId = conds.account?.value ?? null;
    const sourceBill = record.sourceBillId
      ? (billsById.get(record.sourceBillId) ?? null)
      : null;
    return {
      ...record,
      accountId,
      accountName: accountId ? (accountsById.get(accountId) ?? null) : null,
      payeeLabel: payeeValues(conds.payee).join(", "),
      amountCents: getScheduledAmount(conds.amount),
      status: getStatus(
        record.nextDate,
        record.completed,
        hasTransFor(record, links),
        record.customUpcomingLength ?? horizon,
        todayKey,
      ),
      drift: sourceBill ? billDrift(record, sourceBill, todayKey) : null,
      sourceBillName: sourceBill?.name ?? null,
    };
  });
}

export async function listUnlinkedTransactions(userId: string): Promise<
  {
    id: string;
    accountId: string;
    description: string;
    amountCents: number;
    transactionDate: string;
    scheduleId: string | null;
    transferGroupId: string | null;
  }[]
> {
  const rows = await db
    .select({
      id: financeTransactions.id,
      accountId: financeTransactions.accountId,
      description: financeTransactions.description,
      amount: financeTransactions.amount,
      transactionDate: financeTransactions.transactionDate,
      scheduleId: financeTransactions.scheduleId,
      transferGroupId: financeTransactions.transferGroupId,
    })
    .from(financeTransactions)
    .where(
      and(
        eq(financeTransactions.userId, userId),
        isNull(financeTransactions.scheduleId),
      ),
    );

  return rows.map((row) => ({
    id: row.id,
    accountId: row.accountId,
    description: row.description,
    amountCents: numericStringToCents(row.amount) ?? 0,
    transactionDate: row.transactionDate,
    scheduleId: row.scheduleId,
    transferGroupId: row.transferGroupId,
  }));
}

export async function listDiscoverableRows(userId: string): Promise<DiscoverTx[]> {
  const rows = await db
    .select({
      id: financeTransactions.id,
      accountId: financeTransactions.accountId,
      description: financeTransactions.description,
      amount: financeTransactions.amount,
      date: financeTransactions.transactionDate,
      scheduleId: financeTransactions.scheduleId,
      transferGroupId: financeTransactions.transferGroupId,
    })
    .from(financeTransactions)
    .where(eq(financeTransactions.userId, userId));

  return rows.map((row) => ({
    id: row.id,
    accountId: row.accountId,
    date: row.date,
    amountCents: numericStringToCents(row.amount) ?? 0,
    merchant: effectiveMerchant({ description: row.description }),
    scheduleId: row.scheduleId,
    transferGroupId: row.transferGroupId,
  }));
}
