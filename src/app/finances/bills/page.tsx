import { Suspense } from "react";
import { getCurrentUserId } from "@/lib/auth";
import { AppShell } from "@/components/shell/AppShell";
import { BillsView } from "@/components/finances/bills/BillsView";
import { loadBudget, loadBillAnchors } from "@/lib/finances/budget/queries";
import {
  loadBillForecast,
  loadReviewCandidates,
} from "@/lib/finances/dashboardQueries";
import { listPayees } from "@/lib/finances/payees/queries";
import { lastChargeByEnvelope } from "@/lib/finances/billLastCharge";

export const dynamic = "force-dynamic";
export default async function FinancesBillsPage() {
  const userId = await getCurrentUserId();
  const data = await loadBudget(userId, null);
  const [anchors, forecast, review, payees, lastCharges] = await Promise.all([
    loadBillAnchors(userId, data.categories, data.todayKey),
    loadBillForecast(userId, data.todayKey),
    loadReviewCandidates(userId),
    listPayees(userId),
    lastChargeByEnvelope(userId),
  ]);
  return (
    <AppShell active="finances">
      <Suspense fallback={<div className="flex-1" />}>
        <BillsView
          data={data}
          anchors={anchors}
          forecast={forecast}
          review={review}
          payees={payees.map((row) => ({
            id: row.id,
            name: row.name,
            budgetCategoryId: row.claim?.id ?? null,
          }))}
          lastCharges={lastCharges}
        />
      </Suspense>
    </AppShell>
  );
}
