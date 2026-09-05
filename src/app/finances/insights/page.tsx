import { Suspense } from "react";
import { getCurrentUserId } from "@/lib/auth";
import { loadCarryingCost, loadInsightsRows } from "@/lib/finances/dashboardQueries";
import { listStatements } from "@/lib/finances/queries";
import { loadBudget } from "@/lib/finances/budget/queries";
import { AppShell } from "@/components/shell/AppShell";
import { InsightsView } from "@/components/finances/insights/InsightsView";
export const dynamic = "force-dynamic";
export default async function FinancesInsightsPage() {
  const userId = await getCurrentUserId();
  const [rows, data, carryingCost, statements] = await Promise.all([
    loadInsightsRows(userId),
    loadBudget(userId, null),
    loadCarryingCost(userId),
    listStatements(userId),
  ]);
  return (
    <AppShell active="finances">
      <Suspense fallback={<div className="min-h-0 flex-1" />}>
        <InsightsView
          rows={rows}
          data={data}
          carryingCost={carryingCost}
          statements={statements}
        />
      </Suspense>
    </AppShell>
  );
}
