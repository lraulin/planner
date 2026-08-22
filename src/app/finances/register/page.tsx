import { Suspense } from "react";
import { getCurrentUserId } from "@/lib/auth";
import { listAccounts, listTransactions } from "@/lib/finances/queries";
import {
  loadRecurringBills,
  loadRecurringSpend,
} from "@/lib/finances/dashboardQueries";
import { claimedMatchersOf } from "@/lib/finances/registerBillDraft";
import { AppShell } from "@/components/shell/AppShell";
import { FinancesView } from "@/components/finances/FinancesView";

export const dynamic = "force-dynamic";

/** The Register page: every transaction, grouped and filterable. */
export default async function FinancesRegisterPage() {
  const userId = await getCurrentUserId();
  const [transactions, accounts, bills, spend] = await Promise.all([
    listTransactions(userId),
    listAccounts(userId),
    loadRecurringBills(userId),
    loadRecurringSpend(userId),
  ]);

  return (
    <AppShell active="finances">
      <Suspense fallback={<div className="min-h-0 flex-1" />}>
        <FinancesView
          initialTransactions={transactions}
          initialAccounts={accounts}
          initialClaimed={claimedMatchersOf(bills, spend)}
        />
      </Suspense>
    </AppShell>
  );
}
