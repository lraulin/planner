import { and, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { financePayees, financeTransactions } from "@/db/schema";

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

  return new Map(
    rows
      .filter((row): row is { envelopeId: string; lastChargeKey: string } =>
        Boolean(row.envelopeId),
      )
      .map((row) => [row.envelopeId, row.lastChargeKey]),
  );
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
  return row?.lastChargeKey ?? null;
}
