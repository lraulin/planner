import { Suspense } from "react";
import { RulesView } from "@/components/finances/rules/RulesView";
import { AppShell } from "@/components/shell/AppShell";
import { getCurrentUserId } from "@/lib/auth";
import { listRules } from "@/lib/finances/rules/queries";
import { listAccounts } from "@/lib/finances/queries";
import { listPayees } from "@/lib/finances/payees/queries";

export const dynamic = "force-dynamic";

/** What each transaction is, as rules you can read and change rather than code. */
export default async function FinancesRulesPage() {
  const userId = await getCurrentUserId();
  const [rules, payees, accounts] = await Promise.all([
    listRules(userId),
    listPayees(userId),
    listAccounts(userId),
  ]);

  return (
    <AppShell active="finances">
      <Suspense fallback={<div className="min-h-0 flex-1" />}>
        <RulesView
          initialRules={rules}
          payees={payees.map(({ id, name }) => ({ id, name }))}
          accounts={accounts.map(({ id, name }) => ({ id, name }))}
        />
      </Suspense>
    </AppShell>
  );
}
