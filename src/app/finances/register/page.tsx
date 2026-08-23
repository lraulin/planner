import { Suspense } from "react";
import { getCurrentUserId } from "@/lib/auth";
import { listAccounts, listTransactions } from "@/lib/finances/queries";
import {
  loadRecurringBills,
  loadRecurringSpend,
} from "@/lib/finances/dashboardQueries";
import { claimedPayeesOf } from "@/lib/finances/registerBillDraft";
import { loadBudget } from "@/lib/finances/budget/queries";
import { listPostedLinks, listScheduleRecords } from "@/lib/finances/schedules/queries";
import { upcomingOccurrences } from "@/lib/finances/schedules/upcoming";
import { DEFAULT_UPCOMING_LENGTH } from "@/lib/finances/schedules/status";
import { toDateKey } from "@/lib/schedule/geometry";
import { AppShell } from "@/components/shell/AppShell";
import { FinancesView } from "@/components/finances/FinancesView";

export const dynamic = "force-dynamic";

/** The Register page: every transaction, grouped and filterable. */
export default async function FinancesRegisterPage() {
  const userId = await getCurrentUserId();
  const todayKey = toDateKey(new Date());
  const [transactions, accounts, bills, spend, budget, scheduleRecords] =
    await Promise.all([
      listTransactions(userId),
      listAccounts(userId),
      loadRecurringBills(userId),
      loadRecurringSpend(userId),
      loadBudget(userId, null),
      listScheduleRecords(userId),
    ]);
  const links = await listPostedLinks(
    userId,
    scheduleRecords.map((row) => row.id),
  );
  const upcoming = upcomingOccurrences(
    scheduleRecords,
    links,
    DEFAULT_UPCOMING_LENGTH,
    todayKey,
  );

  return (
    <AppShell active="finances">
      <Suspense fallback={<div className="min-h-0 flex-1" />}>
        <FinancesView
          initialTransactions={transactions}
          initialAccounts={accounts}
          initialClaimed={claimedPayeesOf(bills, spend)}
          envelopes={budget.categories.map((category) => ({
            id: category.id,
            name: category.name,
          }))}
          initialUpcoming={upcoming}
        />
      </Suspense>
    </AppShell>
  );
}
