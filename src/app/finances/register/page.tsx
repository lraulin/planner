import { Suspense } from "react";
import { getCurrentUserId } from "@/lib/auth";
import { listAccounts, listTransactions } from "@/lib/finances/queries";
import { loadRecurringBills, loadUpcomingBills } from "@/lib/finances/dashboardQueries";
import { UPCOMING_HORIZON_DAYS } from "@/lib/finances/commitments";
import { claimedPayeesOf } from "@/lib/finances/registerBillDraft";
import { collapsedYearGroupIds } from "@/lib/finances/grouping";
import { parseRegisterQuery, prepareRegister } from "@/lib/finances/registerQuery";
import { listBudgetEnvelopeOptions } from "@/lib/finances/budget/queries";
import { listPayees } from "@/lib/finances/payees/queries";
import { toDateKey } from "@/lib/schedule/geometry";
import { AppShell } from "@/components/shell/AppShell";
import { FinancesView } from "@/components/finances/FinancesView";
import { listFinanceTags } from "@/lib/finances/tags/queries";
import { readSetting } from "@/lib/settings/queries";
import { BUDGET_SCOPE } from "@/lib/settings/scopes";
import { parseBudget } from "@/lib/settings/finances";

export const dynamic = "force-dynamic";

/**
 * The Register page: a compact index of every matching row, plus the first 100
 * transaction details. Deliberately does not read `searchParams` — awaiting them
 * subscribed this server component to `?detail=` and reloaded the ledger when the
 * drawer opened.
 */
export default async function FinancesRegisterPage() {
  const userId = await getCurrentUserId();
  const todayKey = toDateKey(new Date());
  const [
    transactions,
    accounts,
    bills,
    envelopes,
    storedBudget,
    payees,
    tags,
    upcoming,
  ] = await Promise.all([
    listTransactions(userId),
    listAccounts(userId),
    loadRecurringBills(userId),
    listBudgetEnvelopeOptions(userId),
    readSetting(userId, BUDGET_SCOPE),
    listPayees(userId),
    listFinanceTags(userId),
    loadUpcomingBills(userId, todayKey, UPCOMING_HORIZON_DAYS),
  ]);
  const budgetStartMonth = parseBudget(storedBudget).startMonth;
  const defaultCollapsedGroups = collapsedYearGroupIds(
    transactions.map((row) => row.transactionDate),
    todayKey.slice(0, 4),
  );
  const initialPrepared = prepareRegister(
    transactions,
    parseRegisterQuery({
      today: todayKey,
      collapsedGroups: defaultCollapsedGroups,
      sorts: [{ columnId: "date", direction: "desc" }],
      groupBy: ["year", "month"],
    }),
    {
      offBudgetAccountIds: new Set(
        accounts.filter((account) => account.offBudget).map((account) => account.id),
      ),
      budgetStartMonth,
    },
  );

  return (
    <AppShell active="finances">
      <Suspense fallback={<div className="min-h-0 flex-1" />}>
        <FinancesView
          initialPrepared={initialPrepared}
          initialAccounts={accounts}
          initialClaimed={claimedPayeesOf(bills)}
          envelopes={envelopes}
          budgetStartMonth={budgetStartMonth}
          initialUpcoming={upcoming}
          payees={payees.map(({ id, name }) => ({ id, name }))}
          tags={tags.map(({ tag, color }) => ({ tag, color }))}
          todayKey={todayKey}
          defaultCollapsedGroups={defaultCollapsedGroups}
        />
      </Suspense>
    </AppShell>
  );
}
