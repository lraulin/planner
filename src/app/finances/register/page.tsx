import { Suspense } from "react";
import { getCurrentUserId } from "@/lib/auth";
import { listAccounts, listTransactions } from "@/lib/finances/queries";
import { AppShell } from "@/components/shell/AppShell";
import { FinancesView } from "@/components/finances/FinancesView";

export const dynamic = "force-dynamic";

/** The Register page: every transaction, grouped and filterable. */
export default async function FinancesRegisterPage() {
  const userId = await getCurrentUserId();
  const [transactions, accounts] = await Promise.all([
    listTransactions(userId),
    listAccounts(userId),
  ]);

  return (
    <AppShell active="finances">
      <Suspense fallback={<div className="min-h-0 flex-1" />}>
        <FinancesView initialTransactions={transactions} initialAccounts={accounts} />
      </Suspense>
    </AppShell>
  );
}
