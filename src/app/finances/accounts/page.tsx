import { Suspense } from "react";
import { getCurrentUserId } from "@/lib/auth";
import { listAccounts } from "@/lib/finances/queries";
import { AppShell } from "@/components/shell/AppShell";
import { AccountsView } from "@/components/finances/accounts/AccountsView";

export const dynamic = "force-dynamic";

/** Catalog of register accounts — rename, reclassify, bank URL, close, delete. */
export default async function FinancesAccountsPage() {
  const userId = await getCurrentUserId();
  const accounts = await listAccounts(userId);

  return (
    <AppShell active="finances">
      <Suspense fallback={<div className="min-h-0 flex-1" />}>
        <AccountsView initialAccounts={accounts} />
      </Suspense>
    </AppShell>
  );
}
