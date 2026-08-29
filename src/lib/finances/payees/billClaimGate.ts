/**
 * The database half of the bill-claim rule — see `billClaimMatch.ts` for why it exists.
 *
 * Shared by every filing path so "does this bill's claim cover this charge?" is answered
 * once: `applyPayeeClaims` (Track as bill, New bill…, Review, the payee picker, the agent
 * tool) and the browser snapshot's own auto-filing both call it.
 */

import { and, eq, inArray, sql } from "drizzle-orm";
import { financeBudgetCategories, financeTransactions } from "@/db/schema";
import type { FinanceExecutor } from "../dbExecutor";
import { numericStringToCents } from "../money";
import { moneyRows } from "../splitRows";
import {
  billClaimAccepts,
  type BillChargeOnFile,
  type BillClaimCandidate,
} from "./billClaimMatch";

export type ClaimCandidate = BillClaimCandidate & {
  claimedBudgetCategoryId: string;
};

/**
 * The ids whose claimed envelope is a **bill** that this charge does not match.
 *
 * Only bills are gated; a claim on an ordinary envelope still means every charge, so a
 * candidate whose envelope is not a bill never appears in the result.
 */
export async function refusedBillClaims(
  executor: FinanceExecutor,
  userId: string,
  candidates: readonly ClaimCandidate[],
): Promise<Set<string>> {
  if (candidates.length === 0) return new Set();
  const envelopeIds = [
    ...new Set(candidates.map((row) => row.claimedBudgetCategoryId)),
  ];

  const bills = await executor
    .select({
      id: financeBudgetCategories.id,
      expectedCents: financeBudgetCategories.expectedCents,
      cadenceMonths: financeBudgetCategories.cadenceMonths,
      cadenceDays: financeBudgetCategories.cadenceDays,
    })
    .from(financeBudgetCategories)
    .where(
      and(
        eq(financeBudgetCategories.userId, userId),
        eq(financeBudgetCategories.kind, "bill"),
        inArray(financeBudgetCategories.id, envelopeIds),
      ),
    );
  if (bills.length === 0) return new Set();

  const billIds = bills.map((bill) => bill.id);
  const history = await executor
    .select({
      envelopeId: financeTransactions.budgetCategoryId,
      transactionDate: financeTransactions.transactionDate,
      amount: financeTransactions.amount,
    })
    .from(financeTransactions)
    .where(
      and(
        eq(financeTransactions.userId, userId),
        moneyRows,
        sql`${financeTransactions.budgetCategoryId} is not null`,
        inArray(financeTransactions.budgetCategoryId, billIds),
      ),
    );

  const historyByBill = new Map<string, BillChargeOnFile[]>();
  for (const row of history) {
    if (!row.envelopeId) continue;
    const bucket = historyByBill.get(row.envelopeId) ?? [];
    bucket.push({
      transactionDate: row.transactionDate,
      amountCents: numericStringToCents(row.amount) ?? 0,
    });
    historyByBill.set(row.envelopeId, bucket);
  }

  const refused = new Set<string>();
  for (const bill of bills) {
    const forBill = candidates.filter((row) => row.claimedBudgetCategoryId === bill.id);
    if (forBill.length === 0) continue;
    const accepted = billClaimAccepts(
      {
        expectedCents: bill.expectedCents,
        // A bill always declares months; the CHECK constraint guarantees it.
        cadenceMonths: bill.cadenceMonths ?? 1,
        cadenceDays: bill.cadenceDays,
      },
      historyByBill.get(bill.id) ?? [],
      forBill,
    );
    for (const row of forBill) if (!accepted.has(row.id)) refused.add(row.id);
  }
  return refused;
}
