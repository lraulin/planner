import { Suspense } from "react";
import { getCurrentUserId } from "@/lib/auth";
import { listAccounts, listTransactions } from "@/lib/finances/queries";
import { loadRecurringBills, loadUpcomingBills } from "@/lib/finances/dashboardQueries";
import { UPCOMING_HORIZON_DAYS } from "@/lib/finances/commitments";
import { claimedPayeesOf } from "@/lib/finances/registerBillDraft";
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
 * The Register page: every transaction, grouped and filterable.
 *
 * Deliberately does not read `searchParams`. Awaiting them subscribes this server
 * component to every query-string write, including `?detail=` for the item drawer.
 * Opening or closing that drawer then reloaded every transaction and left the
 * drawer stuck until the payload arrived. The tag deep-link is read on the client.
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

  return (
    <AppShell active="finances">
      <Suspense fallback={<div className="min-h-0 flex-1" />}>
        <FinancesView
          initialTransactions={transactions}
          initialAccounts={accounts}
          initialClaimed={claimedPayeesOf(bills)}
          envelopes={envelopes}
          budgetStartMonth={parseBudget(storedBudget).startMonth}
          initialUpcoming={upcoming}
          payees={payees.map(({ id, name }) => ({ id, name }))}
          tags={tags.map(({ tag, color }) => ({ tag, color }))}
          todayKey={todayKey}
        />
      </Suspense>
    </AppShell>
  );
}
