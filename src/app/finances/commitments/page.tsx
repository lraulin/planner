import { Suspense } from "react";
import { getCurrentUserId } from "@/lib/auth";
import { loadDashboard } from "@/lib/finances/dashboardQueries";
import { AppShell } from "@/components/shell/AppShell";
import { CommitmentsView } from "@/components/finances/commitments/CommitmentsView";

export const dynamic = "force-dynamic";

/**
 * Subscriptions, bills, and recurring spend — the money already spoken for.
 *
 * Two tables, one page: pizza must never appear in a list of things that charge you
 * automatically. The twelve-month view is here because it needs both tiers and would
 * otherwise have no home.
 */
export default async function FinancesCommitmentsPage() {
  const userId = await getCurrentUserId();
  const data = await loadDashboard(userId);

  return (
    <AppShell active="finances">
      <Suspense fallback={<div className="min-h-0 flex-1" />}>
        <CommitmentsView
          bills={data.bills}
          spend={data.spend}
          billCharges={data.billCharges}
          spendCharges={Object.fromEntries(data.spendCharges)}
          paydays={data.paydays}
          merchants={data.merchants}
          review={data.review}
        />
      </Suspense>
    </AppShell>
  );
}
