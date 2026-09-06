import { and, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  amazonCharges,
  amazonReceiptAllocations,
  financeTransactions,
} from "@/db/schema";
import { moneyRows } from "./splitRows";

/** Outflows only — a credit filed to the envelope is not the charge a bill is waiting for. */
const outflows = sql`${financeTransactions.amount}::numeric < 0`;

/**
 * The last posted charge date per bill envelope, keyed by envelope id — what `billAnchor`
 * needs to compute a next-due date.
 *
 * A bill's charges are what is filed to its envelope (`budget_category_id`). A payee claim
 * is how they get there, not the definition of what a charge is. Leaves only (`moneyRows`):
 * a split parent holds no envelope. Outflows only: a refund is not the charge being waited
 * for. The Amazon-receipt union is unchanged.
 */
export async function lastChargeByEnvelope(
  userId: string,
): Promise<Map<string, string>> {
  const rows = await db
    .select({
      envelopeId: financeTransactions.budgetCategoryId,
      lastChargeKey: sql<string>`max(${financeTransactions.transactionDate})`,
    })
    .from(financeTransactions)
    .where(
      and(
        eq(financeTransactions.userId, userId),
        isNotNull(financeTransactions.budgetCategoryId),
        moneyRows,
        outflows,
      ),
    )
    .groupBy(financeTransactions.budgetCategoryId);

  const fromEnvelopes = new Map(
    rows
      .filter((row): row is { envelopeId: string; lastChargeKey: string } =>
        Boolean(row.envelopeId),
      )
      .map((row) => [row.envelopeId, row.lastChargeKey]),
  );
  const fromReceipts = await receiptLastChargeByEnvelope(userId);
  for (const [envelopeId, dateKey] of fromReceipts) {
    const current = fromEnvelopes.get(envelopeId);
    if (!current || dateKey > current) fromEnvelopes.set(envelopeId, dateKey);
  }
  return fromEnvelopes;
}

/**
 * The same basis as {@link lastChargeByEnvelope}, for one envelope. Null when nothing has
 * posted to it.
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
    .where(
      and(
        eq(financeTransactions.userId, userId),
        eq(financeTransactions.budgetCategoryId, envelopeId),
        moneyRows,
        outflows,
      ),
    );
  const fromEnvelope = row?.lastChargeKey ?? null;
  const fromReceipt = await receiptLastChargeOnBill(userId, envelopeId);
  if (!fromEnvelope) return fromReceipt;
  if (!fromReceipt) return fromEnvelope;
  return fromReceipt > fromEnvelope ? fromReceipt : fromEnvelope;
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
