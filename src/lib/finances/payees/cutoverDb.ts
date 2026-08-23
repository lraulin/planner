/** Database audit and transactional executor for the payee matcher cutover. */

import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  financePayeeAliases,
  financePayees,
  financeRecurringBills,
  financeRecurringSpend,
  financeSchedules,
  financeTransactions,
} from "@/db/schema";
import { effectiveMerchant } from "../analytics";
import { numericStringToCents } from "../money";
import {
  planPayeeCutover,
  type CutoverPayee,
  type LegacyCommitment,
  type PayeeCutoverInput,
  type PayeeCutoverPlan,
} from "./cutover";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function lockCutover(tx: Transaction, userId: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${userId}, 0))`);
}

async function loadCutoverInput(
  tx: Transaction,
  userId: string,
): Promise<PayeeCutoverInput> {
  const [payeeRows, aliases, bills, spends, schedules, transactions] =
    await Promise.all([
      tx
        .select({
          id: financePayees.id,
          name: financePayees.name,
          commitmentBillId: financePayees.commitmentBillId,
          commitmentSpendId: financePayees.commitmentSpendId,
        })
        .from(financePayees)
        .where(eq(financePayees.userId, userId))
        .orderBy(asc(financePayees.id)),
      tx
        .select({
          payeeId: financePayeeAliases.payeeId,
          alias: financePayeeAliases.alias,
        })
        .from(financePayeeAliases)
        .where(eq(financePayeeAliases.userId, userId))
        .orderBy(asc(financePayeeAliases.alias)),
      tx
        .select({
          id: financeRecurringBills.id,
          name: financeRecurringBills.name,
          matchers: financeRecurringBills.matchers,
        })
        .from(financeRecurringBills)
        .where(eq(financeRecurringBills.userId, userId))
        .orderBy(asc(financeRecurringBills.id)),
      tx
        .select({
          id: financeRecurringSpend.id,
          name: financeRecurringSpend.name,
          matchers: financeRecurringSpend.matchers,
        })
        .from(financeRecurringSpend)
        .where(eq(financeRecurringSpend.userId, userId))
        .orderBy(asc(financeRecurringSpend.id)),
      tx
        .select({
          id: financeSchedules.id,
          name: financeSchedules.name,
          conditions: financeSchedules.conditions,
        })
        .from(financeSchedules)
        .where(eq(financeSchedules.userId, userId))
        .orderBy(asc(financeSchedules.id)),
      tx
        .select({
          id: financeTransactions.id,
          description: financeTransactions.description,
          payeeId: financeTransactions.payeeId,
          amount: financeTransactions.amount,
        })
        .from(financeTransactions)
        .where(eq(financeTransactions.userId, userId))
        .orderBy(asc(financeTransactions.id)),
    ]);

  const aliasesByPayee = new Map<string, string[]>();
  for (const alias of aliases) {
    const owned = aliasesByPayee.get(alias.payeeId);
    if (owned) owned.push(alias.alias);
    else aliasesByPayee.set(alias.payeeId, [alias.alias]);
  }

  const payees: CutoverPayee[] = payeeRows.map((payee) => ({
    id: payee.id,
    name: payee.name,
    aliases: aliasesByPayee.get(payee.id) ?? [],
    claim: payee.commitmentBillId
      ? { kind: "bill", id: payee.commitmentBillId }
      : payee.commitmentSpendId
        ? { kind: "spend", id: payee.commitmentSpendId }
        : null,
  }));
  const commitments: LegacyCommitment[] = [
    ...bills.map((bill) => ({ kind: "bill" as const, ...bill })),
    ...spends.map((spend) => ({ kind: "spend" as const, ...spend })),
  ];
  const payeeNameById = new Map(payeeRows.map((payee) => [payee.id, payee.name]));

  return {
    payees,
    commitments,
    schedules,
    transactions: transactions.map((row) => ({
      id: row.id,
      legacyMerchant: effectiveMerchant({ description: row.description }),
      payeeId: row.payeeId,
      payeeName: row.payeeId ? (payeeNameById.get(row.payeeId) ?? null) : null,
      amountCents: numericStringToCents(row.amount) ?? 0,
    })),
  };
}

export class PayeeCutoverBlockedError extends Error {
  constructor(readonly plan: PayeeCutoverPlan) {
    super("Payee matcher cutover is blocked by the audit report.");
    this.name = "PayeeCutoverBlockedError";
  }
}

/** Read and plan in one database snapshot. Never writes. */
export async function auditPayeeCutover(userId: string): Promise<PayeeCutoverPlan> {
  return db.transaction(async (tx) =>
    planPayeeCutover(await loadCutoverInput(tx, userId)),
  );
}

export type AppliedPayeeCutover = {
  createdPayees: number;
  assignedClaims: number;
  releasedClaims: number;
  rewrittenSchedules: number;
  finalPlan: PayeeCutoverPlan;
};

/**
 * Apply one user's cutover atomically and prove that an immediate replay is a no-op.
 *
 * The advisory lock serializes this one-shot executor with itself for the user. Normal app
 * mutations are switched to dual-write separately; the lock prevents two operators from
 * creating the same placeholder between the first and second plans.
 */
export async function applyPayeeCutover(userId: string): Promise<AppliedPayeeCutover> {
  return db.transaction(async (tx) => {
    await lockCutover(tx, userId);

    const initial = planPayeeCutover(await loadCutoverInput(tx, userId));
    if (!initial.canApply) throw new PayeeCutoverBlockedError(initial);

    for (const placeholder of initial.creates) {
      const [created] = await tx
        .insert(financePayees)
        .values({ userId, name: placeholder.name })
        .returning({ id: financePayees.id });
      await tx.insert(financePayeeAliases).values({
        userId,
        payeeId: created.id,
        alias: placeholder.alias,
      });
    }

    const ready = planPayeeCutover(await loadCutoverInput(tx, userId));
    if (!ready.canApply || ready.creates.length > 0) {
      throw new PayeeCutoverBlockedError(ready);
    }

    for (const release of ready.releases) {
      const changed = await tx
        .update(financePayees)
        .set({
          commitmentBillId: null,
          commitmentSpendId: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(financePayees.userId, userId),
            eq(financePayees.id, release.payeeId),
            release.commitment.kind === "bill"
              ? eq(financePayees.commitmentBillId, release.commitment.id)
              : eq(financePayees.commitmentSpendId, release.commitment.id),
          ),
        )
        .returning({ id: financePayees.id });
      if (changed.length !== 1)
        throw new Error("A payee claim changed during cutover.");
    }

    for (const assignment of ready.claims) {
      if (assignment.payee.type !== "existing") {
        throw new PayeeCutoverBlockedError(ready);
      }
      const changed = await tx
        .update(financePayees)
        .set({
          commitmentBillId:
            assignment.commitment.kind === "bill" ? assignment.commitment.id : null,
          commitmentSpendId:
            assignment.commitment.kind === "spend" ? assignment.commitment.id : null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(financePayees.userId, userId),
            eq(financePayees.id, assignment.payee.id),
          ),
        )
        .returning({ id: financePayees.id });
      if (changed.length !== 1) throw new Error("A payee disappeared during cutover.");
    }

    for (const schedule of ready.scheduleUpdates) {
      const changed = await tx
        .update(financeSchedules)
        .set({ conditions: schedule.conditions, updatedAt: new Date() })
        .where(
          and(
            eq(financeSchedules.userId, userId),
            eq(financeSchedules.id, schedule.id),
          ),
        )
        .returning({ id: financeSchedules.id });
      if (changed.length !== 1)
        throw new Error("A schedule disappeared during cutover.");
    }

    const finalPlan = planPayeeCutover(await loadCutoverInput(tx, userId));
    if (!finalPlan.canApply || !finalPlan.isIdempotent) {
      throw new PayeeCutoverBlockedError(finalPlan);
    }

    return {
      createdPayees: initial.creates.length,
      assignedClaims: ready.claims.length,
      releasedClaims: ready.releases.length,
      rewrittenSchedules: ready.scheduleUpdates.length,
      finalPlan,
    };
  });
}

/**
 * Keep one legacy matcher-array write and its replacement payee claims in one transaction.
 *
 * Stage A callers use this after writing the array through the same `tx`. Stage B removes
 * both the callers and the columns; it is intentionally a compatibility seam, not a second
 * public mutation model.
 */
export async function syncLegacyCommitmentClaims(
  tx: Transaction,
  userId: string,
  commitment: LegacyCommitment,
): Promise<void> {
  await lockCutover(tx, userId);

  const snapshot = await loadCutoverInput(tx, userId);
  const focused = (input: PayeeCutoverInput): PayeeCutoverInput => ({
    ...input,
    commitments: [commitment],
    schedules: [],
    transactions: [],
  });
  const initial = planPayeeCutover(focused(snapshot));
  if (!initial.canApply) throw new PayeeCutoverBlockedError(initial);

  for (const placeholder of initial.creates) {
    const [created] = await tx
      .insert(financePayees)
      .values({ userId, name: placeholder.name })
      .returning({ id: financePayees.id });
    await tx.insert(financePayeeAliases).values({
      userId,
      payeeId: created.id,
      alias: placeholder.alias,
    });
  }

  const ready = planPayeeCutover(focused(await loadCutoverInput(tx, userId)));
  if (!ready.canApply || ready.creates.length > 0) {
    throw new PayeeCutoverBlockedError(ready);
  }

  for (const release of ready.releases) {
    await tx
      .update(financePayees)
      .set({ commitmentBillId: null, commitmentSpendId: null, updatedAt: new Date() })
      .where(
        and(eq(financePayees.userId, userId), eq(financePayees.id, release.payeeId)),
      );
  }
  for (const assignment of ready.claims) {
    if (assignment.payee.type !== "existing") {
      throw new PayeeCutoverBlockedError(ready);
    }
    await tx
      .update(financePayees)
      .set({
        commitmentBillId: commitment.kind === "bill" ? commitment.id : null,
        commitmentSpendId: commitment.kind === "spend" ? commitment.id : null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(financePayees.userId, userId),
          eq(financePayees.id, assignment.payee.id),
        ),
      );
  }
}
