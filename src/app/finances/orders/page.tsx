import { Suspense } from "react";
import { getCurrentUserId } from "@/lib/auth";
import { listAmazonItems } from "@/lib/amazon/queries";
import { parseAmazonOrdersQuery, prepareAmazonOrders } from "@/lib/amazon/ordersQuery";
import { collapsedYearGroupIds } from "@/lib/finances/grouping";
import { localDateKey } from "@/lib/schedule/geometry";
import { AppShell } from "@/components/shell/AppShell";
import { AmazonOrdersView } from "@/components/amazon/AmazonOrdersView";

export const dynamic = "force-dynamic";

/**
 * Itemized Amazon receipts — not ledger rows. A compact index of every matching line,
 * plus the first 100 details. The browser never receives the whole history.
 */
export default async function FinancesOrdersPage() {
  const userId = await getCurrentUserId();
  const todayKey = localDateKey(new Date());
  const items = await listAmazonItems(userId);
  const defaultCollapsedGroups = collapsedYearGroupIds(
    items.map((row) => row.orderDate),
    todayKey.slice(0, 4),
  );
  const initialPrepared = prepareAmazonOrders(
    items,
    parseAmazonOrdersQuery({
      today: todayKey,
      collapsedGroups: defaultCollapsedGroups,
      sorts: [{ columnId: "date", direction: "desc" }],
      groupBy: ["year", "month"],
    }),
  );

  return (
    <AppShell active="finances">
      <Suspense fallback={<div className="min-h-0 flex-1" />}>
        <AmazonOrdersView
          initialPrepared={initialPrepared}
          todayKey={todayKey}
          defaultCollapsedGroups={defaultCollapsedGroups}
        />
      </Suspense>
    </AppShell>
  );
}
