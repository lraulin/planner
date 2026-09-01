import { localDateKey } from "@/lib/schedule/geometry";
import { accountPoolCents } from "../accountPool";
import { accountBalanceView } from "../workingBalance";
import type { FinanceExecutor } from "../dbExecutor";
import { listAccounts } from "../queries";
import { loadWorkingPendingSelection } from "../workingPendingQuery";
import { findMonth, monthKeyOf } from "../budget/envelope";
import { loadBudget } from "../budget/queries";
import type {
  FinanceAuditScope,
  FinanceBudgetMoneyCheckpoint,
  FinanceMoneyCheckpoint,
} from "./types";

/**
 * Capture the money claims a finance write can move. The scope limits detailed account and
 * envelope rows, while the account pool and Ready to Assign stay whole-wallet checkpoints.
 */
export async function captureFinanceMoneyCheckpoint(
  userId: string,
  scope: FinanceAuditScope,
  executor: FinanceExecutor,
  at: Date = new Date(),
): Promise<FinanceMoneyCheckpoint> {
  const accounts = await listAccounts(userId, executor);
  const pending = await loadWorkingPendingSelection(userId, accounts, executor);
  const wantedAccounts = scope.accountIds ? new Set(scope.accountIds) : null;

  const accountCheckpoints = accounts
    .filter((account) => wantedAccounts === null || wantedAccounts.has(account.id))
    .map((account) => {
      const view = accountBalanceView(account, pending.rows);
      return {
        accountId: account.id,
        accountName: account.name,
        postedCents: view.postedCents,
        selectedPendingCents: view.pendingCents,
        workingCents: view.workingCents,
        ledgerCents: account.ledgerBalanceCents,
        reconciliationCents: account.balanceMismatchCents,
      };
    });

  const currentMonth = monthKeyOf(localDateKey(at));
  const wantedMonths = [...new Set(scope.budgetMonths ?? [currentMonth])];
  const budget = await loadBudget(userId, wantedMonths[0] ?? currentMonth, executor, {
    // Audit history grows forever and is not itself part of a money checkpoint. Loading it
    // here would make every future audited write progressively more expensive.
    includeMovementEvents: false,
  });
  const wantedEnvelopes = scope.envelopeIds ? new Set(scope.envelopeIds) : null;
  const budgets: FinanceBudgetMoneyCheckpoint[] = budget.configured
    ? wantedMonths.flatMap((monthKey) => {
        const month = findMonth(budget.months, monthKey);
        if (!month) return [];
        return [
          {
            month: month.month,
            readyToAssignCents: month.readyToAssignCents,
            accountPoolCents: budget.accountPoolCents,
            accountReconciliationCents: month.accountReconciliationCents,
            uncategorizedCount: budget.uncategorizedCount,
            uncategorizedActivityCents: month.uncategorizedActivityCents,
            envelopes: budget.categories
              .filter(
                (category) =>
                  category.kind !== "income" &&
                  (wantedEnvelopes === null || wantedEnvelopes.has(category.id)),
              )
              .map((category) => {
                const values = month.categories[category.id];
                return {
                  envelopeId: category.id,
                  envelopeName: category.name,
                  assignedCents: values?.assignedCents ?? 0,
                  activityCents: values?.activityCents ?? 0,
                  availableCents: values?.balanceCents ?? 0,
                };
              }),
          },
        ];
      })
    : [];

  return {
    accounts: accountCheckpoints,
    selectedPendingCents: pending.rows.reduce(
      (total, row) => total + row.amountCents,
      0,
    ),
    accountPoolCents: accountPoolCents(accounts, pending.rows),
    budgets,
  };
}
