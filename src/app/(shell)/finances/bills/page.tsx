import { Suspense } from "react";
import { getCurrentUserId } from "@/lib/auth";
import { BillsView } from "@/components/finances/bills/BillsView";
import { billAnchorsOf, loadBudget } from "@/lib/finances/budget/queries";
import { loadBillForecast } from "@/lib/finances/dashboardQueries";
import { listPayees } from "@/lib/finances/payees/queries";
import { lastChargeByEnvelope } from "@/lib/finances/billLastCharge";
import { localDateKey } from "@/lib/schedule/geometry";

export const dynamic = "force-dynamic";
export default async function FinancesBillsPage() {
  const userId = await getCurrentUserId();
  const todayKey = localDateKey(new Date());
  const [data, forecast, payees, lastCharges] = await Promise.all([
    loadBudget(userId, null, undefined, { todayKey, includeMovementEvents: false }),
    loadBillForecast(userId, todayKey),
    listPayees(userId),
    lastChargeByEnvelope(userId),
  ]);
  const anchors = billAnchorsOf(data.categories, lastCharges, todayKey);
  return (
    <Suspense fallback={<div className="flex-1" />}>
      <BillsView
        data={data}
        anchors={anchors}
        forecast={forecast}
        payees={payees.map((row) => ({
          id: row.id,
          name: row.name,
          budgetCategoryId: row.claim?.id ?? null,
        }))}
        lastCharges={lastCharges}
      />
    </Suspense>
  );
}
