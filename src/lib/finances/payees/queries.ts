/**
 * Reads for payees (`agent-os/specs/2026-08-23-0748-finance-payees/`).
 *
 * Every query scopes on `userId`, including the joins — a join that forgets it is the way one
 * user's row reaches another user's page (`agent-os/standards/development/security.md`).
 */

import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  financePayeeAliases,
  financePayees,
  financeRecurringBills,
  financeRecurringSpend,
  financeSchedules,
  financeTransactions,
} from "@/db/schema";
import { numericStringToCents } from "../money";
import type { AliasRow } from "./resolve";
import { mergeClaimDecision } from "./merge";
import { storedSchedulePayeeIds } from "./references";

/** Which commitment claims a payee, if any. At most one, by the table's CHECK. */
export type PayeeClaim = { kind: "bill" | "spend"; id: string; name: string };

export type PayeeRow = {
  id: string;
  name: string;
  notes: string;
  /** Sorted, so two reads of an unchanged payee render identically. */
  aliases: string[];
  transactionCount: number;
  /** Signed sum in cents; spending is negative, as everywhere else in this module. */
  totalCents: number;
  claim: PayeeClaim | null;
};

export type PayeeMergePreview = {
  target: Pick<PayeeRow, "id" | "name" | "claim">;
  sources: Pick<PayeeRow, "id" | "name">[];
  movedAliases: string[];
  movedTransactions: number;
  movedTotalCents: number;
  affectedSchedules: { id: string; name: string }[];
  resultingClaim: PayeeClaim | null;
  refusal: string | null;
};

/** Alias → payee for the whole user, the input to `payeeIndex`. */
export async function listAliasRows(userId: string): Promise<AliasRow[]> {
  return db
    .select({
      alias: financePayeeAliases.alias,
      payeeId: financePayeeAliases.payeeId,
    })
    .from(financePayeeAliases)
    .where(eq(financePayeeAliases.userId, userId));
}

/**
 * Every payee with its aliases, its activity, and the commitment that claims it.
 *
 * Three passes rather than one grouped join: aliases and transactions are both one-to-many, so
 * joining them together multiplies the rows and inflates the totals. That bug is invisible
 * until a payee has two aliases.
 */
export async function listPayees(userId: string): Promise<PayeeRow[]> {
  const payees = await db
    .select({
      id: financePayees.id,
      name: financePayees.name,
      notes: financePayees.notes,
      commitmentBillId: financePayees.commitmentBillId,
      commitmentSpendId: financePayees.commitmentSpendId,
    })
    .from(financePayees)
    .where(eq(financePayees.userId, userId))
    .orderBy(asc(sql`lower(${financePayees.name})`));

  if (payees.length === 0) return [];

  const [aliases, activity, bills, spends] = await Promise.all([
    db
      .select({
        payeeId: financePayeeAliases.payeeId,
        alias: financePayeeAliases.alias,
      })
      .from(financePayeeAliases)
      .where(eq(financePayeeAliases.userId, userId))
      .orderBy(asc(financePayeeAliases.alias)),
    db
      .select({
        payeeId: financeTransactions.payeeId,
        count: sql<number>`count(*)::int`,
        amount: sql<string>`coalesce(sum(${financeTransactions.amount}), 0)`,
      })
      .from(financeTransactions)
      .where(
        and(
          eq(financeTransactions.userId, userId),
          sql`${financeTransactions.payeeId} is not null`,
        ),
      )
      .groupBy(financeTransactions.payeeId),
    db
      .select({ id: financeRecurringBills.id, name: financeRecurringBills.name })
      .from(financeRecurringBills)
      .where(eq(financeRecurringBills.userId, userId)),
    db
      .select({ id: financeRecurringSpend.id, name: financeRecurringSpend.name })
      .from(financeRecurringSpend)
      .where(eq(financeRecurringSpend.userId, userId)),
  ]);

  const aliasesByPayee = new Map<string, string[]>();
  for (const row of aliases) {
    const list = aliasesByPayee.get(row.payeeId);
    if (list) list.push(row.alias);
    else aliasesByPayee.set(row.payeeId, [row.alias]);
  }

  const activityByPayee = new Map(
    activity.map((row) => [
      row.payeeId as string,
      { count: row.count, cents: numericStringToCents(row.amount) ?? 0 },
    ]),
  );
  const billNames = new Map(bills.map((row) => [row.id, row.name]));
  const spendNames = new Map(spends.map((row) => [row.id, row.name]));

  return payees.map((payee) => {
    const seen = activityByPayee.get(payee.id);
    let claim: PayeeClaim | null = null;
    if (payee.commitmentBillId) {
      claim = {
        kind: "bill",
        id: payee.commitmentBillId,
        name: billNames.get(payee.commitmentBillId) ?? "",
      };
    } else if (payee.commitmentSpendId) {
      claim = {
        kind: "spend",
        id: payee.commitmentSpendId,
        name: spendNames.get(payee.commitmentSpendId) ?? "",
      };
    }

    return {
      id: payee.id,
      name: payee.name,
      notes: payee.notes,
      aliases: aliasesByPayee.get(payee.id) ?? [],
      transactionCount: seen?.count ?? 0,
      totalCents: seen?.cents ?? 0,
      claim,
    };
  });
}

/** One payee, or null when it is not this user's. Null is the answer for both cases. */
export async function getPayee(
  userId: string,
  payeeId: string,
): Promise<PayeeRow | null> {
  const rows = await listPayees(userId);
  return rows.find((row) => row.id === payeeId) ?? null;
}

/** The payees a commitment claims, for the commitment editors. */
export async function payeesForCommitment(
  userId: string,
  claim: { kind: "bill" | "spend"; id: string },
): Promise<{ id: string; name: string }[]> {
  return db
    .select({ id: financePayees.id, name: financePayees.name })
    .from(financePayees)
    .where(
      and(
        eq(financePayees.userId, userId),
        claim.kind === "bill"
          ? eq(financePayees.commitmentBillId, claim.id)
          : eq(financePayees.commitmentSpendId, claim.id),
      ),
    )
    .orderBy(asc(sql`lower(${financePayees.name})`));
}

/** Aliases belonging to the given payees. Used by merge to move them. */
export async function aliasesOf(
  userId: string,
  payeeIds: readonly string[],
): Promise<string[]> {
  if (payeeIds.length === 0) return [];
  const rows = await db
    .select({ alias: financePayeeAliases.alias })
    .from(financePayeeAliases)
    .where(
      and(
        eq(financePayeeAliases.userId, userId),
        inArray(financePayeeAliases.payeeId, [...payeeIds]),
      ),
    );
  return rows.map((row) => row.alias);
}

/** Everything a person should see before selected payees are consolidated. */
export async function previewPayeeMerge(
  userId: string,
  targetId: string,
  sourceIds: readonly string[],
): Promise<PayeeMergePreview> {
  const sources = [...new Set(sourceIds)].filter((id) => id !== targetId);
  if (sources.length === 0) throw new Error("Select at least two payees to merge.");

  const rows = await listPayees(userId);
  const byId = new Map(rows.map((row) => [row.id, row]));
  const target = byId.get(targetId);
  const sourceRows = sources.map((id) => byId.get(id));
  if (!target || sourceRows.some((row) => row === undefined)) {
    throw new Error("That payee does not exist.");
  }
  const ownedSources = sourceRows.filter((row): row is PayeeRow => row !== undefined);
  const claim = mergeClaimDecision([target, ...ownedSources]);
  const sourceSet = new Set(sources);

  const schedules = await db
    .select({
      id: financeSchedules.id,
      name: financeSchedules.name,
      conditions: financeSchedules.conditions,
    })
    .from(financeSchedules)
    .where(eq(financeSchedules.userId, userId))
    .orderBy(asc(sql`lower(${financeSchedules.name})`));

  return {
    target: { id: target.id, name: target.name, claim: target.claim },
    sources: ownedSources.map((row) => ({ id: row.id, name: row.name })),
    movedAliases: ownedSources.flatMap((row) => row.aliases).sort(),
    movedTransactions: ownedSources.reduce(
      (total, row) => total + row.transactionCount,
      0,
    ),
    movedTotalCents: ownedSources.reduce((total, row) => total + row.totalCents, 0),
    affectedSchedules: schedules
      .filter((schedule) =>
        storedSchedulePayeeIds(schedule.conditions).some((id) => sourceSet.has(id)),
      )
      .map(({ id, name }) => ({ id, name })),
    resultingClaim: claim.claim,
    refusal: claim.refusal,
  };
}
