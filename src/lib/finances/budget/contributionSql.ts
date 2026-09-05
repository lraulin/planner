import { and, eq, notInArray, sql } from "drizzle-orm";
import { financeAccounts, financeTransactions } from "@/db/schema";
import { moneyRows } from "../splitRows";

/** One predicate for Budget activity and envelope reports, including Uncategorized. */
export function budgetContributionSql(
  userId: string,
  supersededPendingIds: readonly string[],
) {
  return and(
    eq(financeTransactions.userId, userId),
    eq(financeAccounts.userId, userId),
    eq(financeAccounts.offBudget, false),
    moneyRows,
    supersededPendingIds.length
      ? notInArray(financeTransactions.id, [...supersededPendingIds])
      : undefined,
    sql`(${financeTransactions.transferGroupId} is not null or coalesce(${financeTransactions.flowOverride}::text, ${financeTransactions.derivedFlow}::text, '') <> 'internal_transfer')`,
    sql`not exists (select 1 from ${financeTransactions} as other join ${financeAccounts} as other_account on other_account.id = other.account_id where other.transfer_group_id = ${financeTransactions.transferGroupId} and other.id <> ${financeTransactions.id} and other.user_id = ${userId} and other_account.user_id = ${userId} and other_account.off_budget = false)`,
  );
}
