import { and, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  amazonCharges,
  amazonReceiptAllocations,
  financePayees,
  financeTransactions,
} from "@/db/schema";

/**
 * The last posted charge date per bill envelope, keyed by envelope id — what `billAnchor`
 * needs to compute a next-due date. Joined through the payee claim, which is what routes a
 * charge to a bill (`finance_payees.claimed_budget_category_id`), not through the
 * transaction's own `budget_category_id` — a hand-recategorised charge should not move the
 * due-date anchor.
 */
export async function lastChargeByEnvelope(
  userId: string,
): Promise<Map<string, string>> {
  const rows = await db
    .select({
      envelopeId: financePayees.claimedBudgetCategoryId,
      lastChargeKey: sql<string>`max(${financeTransactions.transactionDate})`,
    })
    .from(financeTransactions)
    .innerJoin(financePayees, eq(financePayees.id, financeTransactions.payeeId))
    .where(
      and(
        eq(financeTransactions.userId, userId),
        eq(financePayees.userId, userId),
        isNotNull(financePayees.claimedBudgetCategoryId),
      ),
    )
    .groupBy(financePayees.claimedBudgetCategoryId);

  const fromPayees = new Map(
    rows
      .filter((row): row is { envelopeId: string; lastChargeKey: string } =>
        Boolean(row.envelopeId),
      )
      .map((row) => [row.envelopeId, row.lastChargeKey]),
  );
  const fromReceipts = await receiptLastChargeByEnvelope(userId);
  for (const [envelopeId, dateKey] of fromReceipts) {
    const current = fromPayees.get(envelopeId);
    if (!current || dateKey > current) fromPayees.set(envelopeId, dateKey);
  }
  return fromPayees;
}

/**
 * The same join as {@link lastChargeByEnvelope}, for one envelope. Null when nothing has
 * posted through a claimed payee — a recategorised charge on a different payee does not
 * count.
 */
export async function lastChargeOnBill(
  userId: string,
  envelopeId: string,
): Promise<string | null> {
  const [row] = await db
    .select({
      lastChargeKey: sql<string | null>`max(${financeTransactions.transactionDate})`,
    })
    .from(financeTransactions)
    .innerJoin(financePayees, eq(financePayees.id, financeTransactions.payeeId))
    .where(
      and(
        eq(financeTransactions.userId, userId),
        eq(financePayees.userId, userId),
        eq(financePayees.claimedBudgetCategoryId, envelopeId),
      ),
    );
  const fromPayee = row?.lastChargeKey ?? null;
  const fromReceipt = await receiptLastChargeOnBill(userId, envelopeId);
  if (!fromPayee) return fromReceipt;
  if (!fromReceipt) return fromPayee;
  return fromReceipt > fromPayee ? fromReceipt : fromPayee;
}

async function receiptLastChargeByEnvelope(
  userId: string,
): Promise<Map<string, string>> {
  const rows = await db
    .select({
      envelopeId: amazonReceiptAllocations.billId,
      lastChargeKey: sql<string>`max(${amazonCharges.paymentDate})`,
    })
    .from(amazonReceiptAllocations)
    .innerJoin(
      amazonCharges,
      and(
        eq(amazonCharges.id, amazonReceiptAllocations.chargeId),
        eq(amazonCharges.userId, userId),
      ),
    )
    .where(
      and(
        eq(amazonReceiptAllocations.userId, userId),
        isNotNull(amazonReceiptAllocations.billId),
        eq(amazonCharges.status, "completed"),
      ),
    )
    .groupBy(amazonReceiptAllocations.billId);
  return new Map(
    rows
      .filter((row): row is { envelopeId: string; lastChargeKey: string } =>
        Boolean(row.envelopeId && row.lastChargeKey),
      )
      .map((row) => [row.envelopeId, row.lastChargeKey]),
  );
}

async function receiptLastChargeOnBill(
  userId: string,
  envelopeId: string,
): Promise<string | null> {
  const [row] = await db
    .select({
      lastChargeKey: sql<string | null>`max(${amazonCharges.paymentDate})`,
    })
    .from(amazonReceiptAllocations)
    .innerJoin(
      amazonCharges,
      and(
        eq(amazonCharges.id, amazonReceiptAllocations.chargeId),
        eq(amazonCharges.userId, userId),
      ),
    )
    .where(
      and(
        eq(amazonReceiptAllocations.userId, userId),
        eq(amazonReceiptAllocations.billId, envelopeId),
        eq(amazonCharges.status, "completed"),
      ),
    );
  return row?.lastChargeKey ?? null;
}
