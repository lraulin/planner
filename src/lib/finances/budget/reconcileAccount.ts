import { db } from "@/db";
import { financeAccounts, financeTransactions } from "@/db/schema";
import { ownedRow } from "@/lib/db/owned";
import { localDateKey } from "@/lib/schedule/geometry";
import { parseBudget } from "@/lib/settings/finances";
import { readSetting } from "@/lib/settings/queries";
import { BUDGET_SCOPE } from "@/lib/settings/scopes";
import { centsToNumericString, formatUsd } from "../money";
import { reconcileAdjustment } from "../reconcileAdjustment";
import { monthKeyOf } from "./envelope";
import { loadBudgetMismatch } from "./queries";
import { captureFinanceMoneyCheckpoint } from "../audit/checkpoints";
import { writeFinanceAuditEvent } from "../audit/writes";

export type ReconcileReceipt = {
  accountId: string;
  accountName: string;
  /** False when the difference had already closed — a second click, or someone else's fix. */
  applied: boolean;
  differenceCents: number;
  transactionId: string | null;
};

/**
 * D5: the one deliberate way a bank/ledger mismatch moves Ready to Assign.
 *
 * Re-verifies the account's D3 difference fresh, inside this transaction, rather than
 * trusting whatever figure the confirmation dialog last showed — a row fixed or a sync
 * landed in between must not let a stale number through. Writes one adjustment transaction
 * for exactly that difference (`reconcileAdjustment`) and nothing else; a $0 difference is a
 * no-op receipt, not an error, since confirming a gap that already closed is not a mistake.
 */
export async function reconcileAccount(
  userId: string,
  accountId: string,
): Promise<ReconcileReceipt> {
  return await db.transaction(async (tx) => {
    const [account] = await tx
      .select({ id: financeAccounts.id, name: financeAccounts.name })
      .from(financeAccounts)
      .where(ownedRow(financeAccounts, accountId, userId))
      .limit(1);
    if (!account) throw new Error("Account not found.");

    const settings = parseBudget(await readSetting(userId, BUDGET_SCOPE, tx));
    const startMonth = settings.startMonth;
    if (!startMonth) {
      throw new Error("Set up the budget before reconciling an account.");
    }

    const todayKey = localDateKey(new Date());
    const mismatch = await loadBudgetMismatch(userId, startMonth, tx);
    const accountMismatch = mismatch.accounts.find(
      (row) => row.accountId === accountId,
    );
    if (!accountMismatch) {
      throw new Error(
        `${account.name} has no recorded opening yet, so there is nothing to reconcile.`,
      );
    }
    const differenceCents = accountMismatch.mismatchCents;
    const adjustment = reconcileAdjustment(accountId, differenceCents, todayKey);
    if (!adjustment) {
      return {
        accountId,
        accountName: account.name,
        applied: false,
        differenceCents: 0,
        transactionId: null,
      };
    }

    const auditScope = {
      accountIds: [accountId],
      accountNames: [account.name],
      budgetMonths: [monthKeyOf(todayKey)],
    };
    const beforeCheckpoint = await captureFinanceMoneyCheckpoint(
      userId,
      auditScope,
      tx,
    );

    const [inserted] = await tx
      .insert(financeTransactions)
      .values({
        userId,
        accountId,
        transactionDate: adjustment.transactionDate,
        description: adjustment.description,
        amount: centsToNumericString(adjustment.amountCents),
        flowOverride: adjustment.flowOverride,
        externalSource: adjustment.externalSource,
      })
      .returning({ id: financeTransactions.id });

    const afterCheckpoint = await captureFinanceMoneyCheckpoint(userId, auditScope, tx);
    await writeFinanceAuditEvent(tx, userId, {
      kind: "reconciliation_adjustment",
      origin: "Finance accounts",
      summary: `Reconciled ${account.name}: ${formatUsd(differenceCents)} adjustment to match the bank.`,
      scope: auditScope,
      beforeCheckpoint,
      afterCheckpoint,
      changes: [
        {
          entityType: "transaction",
          entityIdentity: inserted.id,
          before: null,
          after: {
            accountId,
            amountCents: adjustment.amountCents,
            description: adjustment.description,
            externalSource: adjustment.externalSource,
          },
        },
      ],
    });

    return {
      accountId,
      accountName: account.name,
      applied: true,
      differenceCents,
      transactionId: inserted.id,
    };
  });
}
