/**
 * Writes for Actual-style schedules.
 *
 * Every mutation takes `userId` first, scopes on it, and proves the row was theirs before
 * touching it (`agent-os/standards/development/security.md`).
 */

import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { isUniqueViolation } from "@/lib/db/constraints";
import {
  financeAccounts,
  financePayees,
  financeSchedules,
  financeTransactions,
} from "@/db/schema";
import { loadRecurringBills } from "@/lib/finances/dashboardQueries";
import { centsToNumericString } from "@/lib/finances/money";
import { shiftDateKey } from "@/lib/schedule/geometry";
import * as sortKey from "@/lib/tree/sortKey";
import {
  dateConfigOf,
  extractScheduleConds,
  getScheduledAmount,
  parseConditions,
  payeeValues,
  type ScheduleCondition,
} from "./conditions";
import { billToScheduleConditions, type BillForSchedule } from "./fromBill";
import { matchesOccurrence } from "./match";
import {
  advanceNextDate,
  initialNextDate,
  skipNextDate as skipCursor,
} from "./nextDate";
import { getSchedule, listScheduleRecords, listUnlinkedTransactions } from "./queries";
import type { RecurConfig } from "./recur";
import { proposalsForConfig, type DiscoverProposal } from "./discover";
import { listDiscoverableRows } from "./queries";

async function requireSchedule(userId: string, scheduleId: string) {
  const row = await getSchedule(userId, scheduleId);
  if (!row) throw new Error("That schedule does not exist.");
  return row;
}

async function requireOwnedAccount(userId: string, accountId: string): Promise<void> {
  const [row] = await db
    .select({ id: financeAccounts.id })
    .from(financeAccounts)
    .where(and(eq(financeAccounts.id, accountId), eq(financeAccounts.userId, userId)))
    .limit(1);
  if (!row) throw new Error("That account does not exist.");
}

async function requireOwnedPayees(
  userId: string,
  payeeIds: readonly string[],
): Promise<Map<string, string>> {
  const uniqueIds = [...new Set(payeeIds)];
  if (uniqueIds.length === 0) return new Map();
  const rows = await db
    .select({ id: financePayees.id, name: financePayees.name })
    .from(financePayees)
    .where(and(eq(financePayees.userId, userId), inArray(financePayees.id, uniqueIds)));
  if (rows.length !== uniqueIds.length) {
    throw new Error("One or more payees do not exist.");
  }
  return new Map(rows.map((row) => [row.id, row.name]));
}

async function nextSortKey(userId: string): Promise<string> {
  const [last] = await db
    .select({ sortKey: financeSchedules.sortKey })
    .from(financeSchedules)
    .where(eq(financeSchedules.userId, userId))
    .orderBy(desc(financeSchedules.sortKey))
    .limit(1);
  return last ? sortKey.after(last.sortKey) : sortKey.first();
}

function configOf(conditions: readonly ScheduleCondition[]): RecurConfig {
  const config = dateConfigOf(extractScheduleConds([...conditions]).date);
  if (!config) throw new Error("A schedule needs a date recurrence.");
  return config;
}

export type ScheduleDraft = {
  name: string;
  conditions: ScheduleCondition[];
  postsTransaction?: boolean;
  completed?: boolean;
  customUpcomingLength?: string | null;
  sourceBillId?: string | null;
};

async function insertSchedule(
  userId: string,
  draft: ScheduleDraft,
  todayKey: string,
): Promise<string> {
  const conditions = parseConditions(draft.conditions);
  if (!conditions) throw new Error("Those conditions are not a valid schedule.");
  await requireOwnedPayees(userId, payeeValues(extractScheduleConds(conditions).payee));
  const nextDate = initialNextDate(configOf(conditions), todayKey);
  const [row] = await db
    .insert(financeSchedules)
    .values({
      userId,
      name: draft.name.trim(),
      conditions,
      postsTransaction: draft.postsTransaction ?? false,
      completed: draft.completed ?? false,
      nextDate,
      customUpcomingLength: draft.customUpcomingLength ?? null,
      sourceBillId: draft.sourceBillId ?? null,
      sortKey: await nextSortKey(userId),
    })
    .returning({ id: financeSchedules.id });
  if (!row) throw new Error("Could not create the schedule.");
  return row.id;
}

export async function createSchedule(
  userId: string,
  draft: ScheduleDraft,
  todayKey: string,
): Promise<string> {
  const name = draft.name.trim();
  if (name === "") throw new Error("A schedule needs a name.");
  const accountId = extractScheduleConds(draft.conditions).account?.value;
  if (accountId) await requireOwnedAccount(userId, accountId);
  try {
    return await insertSchedule(userId, { ...draft, name }, todayKey);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new Error(`A schedule named "${name}" already exists.`);
    }
    throw error;
  }
}

export type SchedulePatch = {
  name?: string;
  conditions?: ScheduleCondition[];
  postsTransaction?: boolean;
  completed?: boolean;
  customUpcomingLength?: string | null;
};

export async function updateSchedule(
  userId: string,
  scheduleId: string,
  patch: SchedulePatch,
  todayKey: string,
): Promise<void> {
  const existing = await requireSchedule(userId, scheduleId);
  const name = patch.name !== undefined ? patch.name.trim() : existing.name;
  if (name === "") throw new Error("A schedule needs a name.");
  const conditions = patch.conditions
    ? parseConditions(patch.conditions)
    : existing.conditions;
  if (!conditions) throw new Error("Those conditions are not a valid schedule.");
  const accountId = extractScheduleConds(conditions).account?.value;
  if (accountId) await requireOwnedAccount(userId, accountId);
  await requireOwnedPayees(userId, payeeValues(extractScheduleConds(conditions).payee));

  const nextDate =
    patch.conditions !== undefined
      ? initialNextDate(configOf(conditions), todayKey)
      : existing.nextDate;

  const [updated] = await db
    .update(financeSchedules)
    .set({
      name,
      conditions,
      postsTransaction: patch.postsTransaction ?? existing.postsTransaction,
      completed: patch.completed ?? existing.completed,
      customUpcomingLength:
        patch.customUpcomingLength === undefined
          ? existing.customUpcomingLength
          : patch.customUpcomingLength,
      nextDate,
      updatedAt: new Date(),
    })
    .where(
      and(eq(financeSchedules.id, scheduleId), eq(financeSchedules.userId, userId)),
    )
    .returning({ id: financeSchedules.id });
  if (!updated) throw new Error("That schedule does not exist.");
}

export async function deleteSchedule(
  userId: string,
  scheduleId: string,
): Promise<void> {
  await requireSchedule(userId, scheduleId);
  await db
    .delete(financeSchedules)
    .where(
      and(eq(financeSchedules.id, scheduleId), eq(financeSchedules.userId, userId)),
    );
}

export async function skipSchedule(userId: string, scheduleId: string): Promise<void> {
  const existing = await requireSchedule(userId, scheduleId);
  const nextDate = skipCursor(configOf(existing.conditions), existing.nextDate);
  await db
    .update(financeSchedules)
    .set({ nextDate, updatedAt: new Date() })
    .where(
      and(eq(financeSchedules.id, scheduleId), eq(financeSchedules.userId, userId)),
    );
}

export async function completeSchedule(
  userId: string,
  scheduleId: string,
  completed: boolean,
): Promise<void> {
  await requireSchedule(userId, scheduleId);
  await db
    .update(financeSchedules)
    .set({ completed, updatedAt: new Date() })
    .where(
      and(eq(financeSchedules.id, scheduleId), eq(financeSchedules.userId, userId)),
    );
}

/**
 * Insert exactly one linked transaction on the current `next_date` and advance the cursor.
 *
 * Requires an account condition — Actual no-ops without one, and we surface that as an
 * error rather than silently doing nothing.
 */
export async function postScheduleNow(
  userId: string,
  scheduleId: string,
): Promise<string> {
  const existing = await requireSchedule(userId, scheduleId);
  const conds = extractScheduleConds(existing.conditions);
  const accountId = conds.account?.value;
  if (!accountId) throw new Error("Pick an account on the schedule first.");
  await requireOwnedAccount(userId, accountId);

  const payeeId = payeeValues(conds.payee)[0] ?? null;
  const payees = await requireOwnedPayees(userId, payeeId ? [payeeId] : []);
  const description = payeeId ? (payees.get(payeeId) ?? existing.name) : existing.name;
  const amountCents = getScheduledAmount(conds.amount);
  const [inserted] = await db
    .insert(financeTransactions)
    .values({
      userId,
      accountId,
      transactionDate: existing.nextDate,
      description,
      payeeId,
      amount: centsToNumericString(amountCents),
      scheduleId: existing.id,
    })
    .returning({ id: financeTransactions.id });
  if (!inserted) throw new Error("Could not post the transaction.");

  const nextDate = advanceNextDate(configOf(existing.conditions), existing.nextDate);
  await db
    .update(financeSchedules)
    .set({ nextDate, updatedAt: new Date() })
    .where(
      and(eq(financeSchedules.id, scheduleId), eq(financeSchedules.userId, userId)),
    );
  return inserted.id;
}

export async function linkTransaction(
  userId: string,
  scheduleId: string,
  transactionId: string,
): Promise<void> {
  const existing = await requireSchedule(userId, scheduleId);
  const [row] = await db
    .select({
      id: financeTransactions.id,
      transactionDate: financeTransactions.transactionDate,
    })
    .from(financeTransactions)
    .where(
      and(
        eq(financeTransactions.id, transactionId),
        eq(financeTransactions.userId, userId),
      ),
    )
    .limit(1);
  if (!row) throw new Error("Transaction not found.");

  const [updated] = await db
    .update(financeTransactions)
    .set({ scheduleId, updatedAt: new Date() })
    .where(
      and(
        eq(financeTransactions.id, transactionId),
        eq(financeTransactions.userId, userId),
      ),
    )
    .returning({ id: financeTransactions.id });
  if (!updated) throw new Error("Transaction not found.");

  // Advance past the occurrence we matched, not the transaction date. An early payment
  // (2-day lookback) would otherwise land back on the same next_date.
  const paidOn =
    row.transactionDate > existing.nextDate ? row.transactionDate : existing.nextDate;
  const nextDate = advanceNextDate(configOf(existing.conditions), paidOn);
  await db
    .update(financeSchedules)
    .set({ nextDate, updatedAt: new Date() })
    .where(
      and(eq(financeSchedules.id, scheduleId), eq(financeSchedules.userId, userId)),
    );
}

export async function unlinkTransaction(
  userId: string,
  transactionId: string,
): Promise<void> {
  const [updated] = await db
    .update(financeTransactions)
    .set({ scheduleId: null, updatedAt: new Date() })
    .where(
      and(
        eq(financeTransactions.id, transactionId),
        eq(financeTransactions.userId, userId),
      ),
    )
    .returning({ id: financeTransactions.id });
  if (!updated) throw new Error("Transaction not found.");
}

export type FindMatchesResult = { linked: number };

/**
 * Link unlinked transactions that match a schedule's current occurrence, and advance
 * each matched schedule's cursor.
 */
export async function findMatches(userId: string): Promise<FindMatchesResult> {
  const [schedules, candidates] = await Promise.all([
    listScheduleRecords(userId),
    listUnlinkedTransactions(userId),
  ]);
  let linked = 0;
  for (const schedule of schedules) {
    if (schedule.completed) continue;
    const conds = extractScheduleConds(schedule.conditions);
    const match = candidates.find((row) =>
      matchesOccurrence(conds, schedule.nextDate, row, schedule.postsTransaction),
    );
    if (!match) continue;
    await linkTransaction(userId, schedule.id, match.id);
    match.scheduleId = schedule.id;
    linked += 1;
  }
  return { linked };
}

export async function linkInsertedTransactions(
  userId: string,
  transactionIds: readonly string[],
): Promise<FindMatchesResult> {
  if (transactionIds.length === 0) return { linked: 0 };
  return findMatches(userId);
}

export type ImportFromBillsResult = {
  created: number;
  skippedExisting: number;
  skippedInactive: number;
};

export async function importSchedulesFromBills(
  userId: string,
  todayKey: string,
): Promise<ImportFromBillsResult> {
  const bills = await loadRecurringBills(userId);
  const existing = await listScheduleRecords(userId);
  const importedBillIds = new Set(
    existing.flatMap((row) => (row.sourceBillId ? [row.sourceBillId] : [])),
  );
  const takenNames = new Set(existing.map((row) => row.name));

  let created = 0;
  let skippedExisting = 0;
  let skippedInactive = 0;

  for (const bill of bills) {
    if (bill.status !== "active") {
      skippedInactive += 1;
      continue;
    }
    if (importedBillIds.has(bill.id) || takenNames.has(bill.name)) {
      skippedExisting += 1;
      continue;
    }
    const source: BillForSchedule = bill;
    await insertSchedule(
      userId,
      {
        name: bill.name,
        conditions: billToScheduleConditions(source, todayKey),
        sourceBillId: bill.id,
      },
      todayKey,
    );
    takenNames.add(bill.name);
    created += 1;
  }

  return { created, skippedExisting, skippedInactive };
}

const DISCOVER_CONFIGS: RecurConfig[] = [
  { frequency: "weekly", start: "2020-01-01" },
  { frequency: "weekly", interval: 2, start: "2020-01-01" },
  { frequency: "monthly", start: "2020-01-01" },
  { frequency: "monthly", patterns: [{ type: "day", value: -1 }], start: "2020-01-01" },
];

export async function discoverScheduleProposals(
  userId: string,
): Promise<DiscoverProposal[]> {
  const [rows, existing] = await Promise.all([
    listDiscoverableRows(userId),
    listScheduleRecords(userId),
  ]);
  const accountIds = [...new Set(rows.map((row) => row.accountId))];
  const importedPayees = new Set(
    existing.flatMap((row) => payeeValues(extractScheduleConds(row.conditions).payee)),
  );

  const proposals: DiscoverProposal[] = [];
  for (const accountId of accountIds) {
    const latest = rows
      .filter((row) => row.accountId === accountId)
      .sort((a, b) => (a.date < b.date ? 1 : -1))[0]?.date;
    if (!latest) continue;
    for (const base of DISCOVER_CONFIGS) {
      // Walk a small window of start dates ending at `latest`, the way Actual samples.
      for (let offset = 0; offset < 14; offset += 1) {
        const start = shiftBack(latest, offset);
        const config: RecurConfig = { ...base, start };
        if (
          config.frequency === "monthly" &&
          !config.patterns &&
          Number(start.slice(8, 10)) > 28
        ) {
          continue;
        }
        proposals.push(...proposalsForConfig(config, rows, accountId));
      }
    }
  }

  return dedupeProposals(proposals, importedPayees);
}

function shiftBack(key: string, days: number): string {
  return shiftDateKey(key, -days);
}

function dedupeProposals(
  proposals: DiscoverProposal[],
  importedPayees: Set<string>,
): DiscoverProposal[] {
  const best = new Map<string, DiscoverProposal>();
  for (const proposal of proposals) {
    if (importedPayees.has(proposal.payeeId)) continue;
    const key = `${proposal.accountId}:${proposal.payeeId}:${proposal.date.frequency}:${proposal.date.interval ?? 1}`;
    const current = best.get(key);
    if (!current || proposal.rank > current.rank) best.set(key, proposal);
  }
  return [...best.values()].sort((a, b) => b.rank - a.rank);
}

export async function createSchedulesFromDiscover(
  userId: string,
  proposals: DiscoverProposal[],
  todayKey: string,
): Promise<number> {
  let created = 0;
  for (const proposal of proposals) {
    const conditions: ScheduleCondition[] = [
      { field: "account", op: "is", value: proposal.accountId },
      { field: "payee", op: "is", value: proposal.payeeId },
      { field: "amount", op: "isapprox", value: proposal.amountCents },
      { field: "date", op: "isapprox", value: proposal.date },
    ];
    try {
      await createSchedule(userId, { name: proposal.merchant, conditions }, todayKey);
      created += 1;
    } catch (error) {
      if (error instanceof Error && /already exists/.test(error.message)) continue;
      throw error;
    }
  }
  return created;
}
