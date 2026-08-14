import { Suspense } from "react";
import { getCurrentUserId } from "@/lib/auth";
import {
  loadCarryingCost,
  loadInsightsRows,
  loadRecurringBills,
  unclassifiedCount,
} from "@/lib/finances/dashboardQueries";
import { listStatements } from "@/lib/finances/queries";
import { AppShell } from "@/components/shell/AppShell";
import { InsightsView } from "@/components/finances/insights/InsightsView";

export const dynamic = "force-dynamic";

/**
 * The Insights page: what life costs, read back out of the imported history.
 *
 * Loads the **whole** history rather than the selected window. Every rolling average on the
 * page needs the twelve buckets before the first visible one, and windowing here would make
 * the overlay null exactly where someone is looking. Three years is a few thousand rows.
 */
export default async function FinancesInsightsPage() {
  const userId = await getCurrentUserId();
  const [rows, carryingCost, unclassified, bills, statements] = await Promise.all([
    loadInsightsRows(userId),
    loadCarryingCost(userId),
    unclassifiedCount(userId),
    loadRecurringBills(userId),
    listStatements(userId),
  ]);

  return (
    <AppShell active="finances">
      <Suspense fallback={<div className="min-h-0 flex-1" />}>
        <InsightsView
          rows={rows}
          carryingCost={carryingCost}
          unclassified={unclassified}
          bills={bills}
          statements={statements}
        />
      </Suspense>
    </AppShell>
  );
}
