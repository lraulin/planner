import { Suspense } from "react";
import { getCurrentUserId } from "@/lib/auth";
import { listStatements, listTransactions } from "@/lib/finances/queries";
import { AppShell } from "@/components/shell/AppShell";
import { StatementsView } from "@/components/finances/StatementsView";

export const dynamic = "force-dynamic";

/** Official statement snapshots compared to the register. */
export default async function FinancesStatementsPage() {
  const userId = await getCurrentUserId();
  const [statements, transactions] = await Promise.all([
    listStatements(userId),
    listTransactions(userId),
  ]);

  return (
    <AppShell active="finances">
      <Suspense fallback={<div className="min-h-0 flex-1" />}>
        <StatementsView
          initialStatements={statements}
          initialTransactions={transactions}
        />
      </Suspense>
    </AppShell>
  );
}
