/**
 * Load the pending rows the working-balance rule is allowed to add on top of a headline.
 *
 * Shared by Dashboard and Budget so they cannot select different pending sets for the same
 * accounts. Spec: `agent-os/specs/2026-08-24-2206-single-pool-budget/` D2.
 */

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import type { FinanceExecutor } from "./dbExecutor";
import { financeTransactions } from "@/db/schema";
import { numericStringToCents } from "./money";
import type { PendingRow } from "./workingBalance";
import { selectWorkingPending, type WorkingPendingAccount } from "./workingPending";

export async function loadSelectedWorkingPending(
  userId: string,
  accounts: readonly WorkingPendingAccount[],
  nowMs: number = Date.now(),
  executor: FinanceExecutor = db,
): Promise<PendingRow[]> {
  const pendingRows = await executor
    .select({
      accountId: financeTransactions.accountId,
      amount: financeTransactions.amount,
      source: financeTransactions.externalSource,
    })
    .from(financeTransactions)
    .where(
      and(
        eq(financeTransactions.userId, userId),
        eq(financeTransactions.pending, true),
      ),
    );

  return selectWorkingPending(
    pendingRows.map((row) => ({
      accountId: row.accountId,
      amountCents: numericStringToCents(row.amount) ?? 0,
      source: row.source ?? "",
    })),
    accounts,
    nowMs,
  ).map(({ accountId, amountCents }) => ({ accountId, amountCents }));
}
