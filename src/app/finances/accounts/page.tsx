import { localDateKey } from "@/lib/schedule/geometry";
import { listLinks } from "@/lib/banksync/queries";
import { Suspense } from "react";
import { getCurrentUserId } from "@/lib/auth";
import { loadDashboard } from "@/lib/finances/dashboardQueries";
import { loadBudgetMismatch } from "@/lib/finances/budget/queries";
import { readSetting } from "@/lib/settings/queries";
import { parseBudget } from "@/lib/settings/finances";
import { BUDGET_SCOPE } from "@/lib/settings/scopes";
import { AppShell } from "@/components/shell/AppShell";
import { AccountsView } from "@/components/finances/accounts/AccountsView";

export const dynamic = "force-dynamic";

/** Catalog of register accounts — rename, reclassify, bank URL, close, delete. */
export default async function FinancesAccountsPage() {
  const userId = await getCurrentUserId();
  const [data, links, mismatch] = await Promise.all([
    loadDashboard(userId),
    listLinks(userId),
    readSetting(userId, BUDGET_SCOPE).then((stored) =>
      loadBudgetMismatch(userId, parseBudget(stored).startMonth),
    ),
  ]);

  return (
    <AppShell active="finances">
      <Suspense fallback={<div className="min-h-0 flex-1" />}>
        <AccountsView
          initialAccounts={data.accounts}
          operations={data}
          links={links}
          todayKey={localDateKey(new Date())}
          mismatch={mismatch}
        />
      </Suspense>
    </AppShell>
  );
}
