import { Suspense } from "react";
import { getCurrentUserId } from "@/lib/auth";
import { listAmazonItems } from "@/lib/amazon/queries";
import { AppShell } from "@/components/shell/AppShell";
import { AmazonOrdersView } from "@/components/amazon/AmazonOrdersView";

export const dynamic = "force-dynamic";

/** Itemized Amazon receipts — not ledger rows. */
export default async function FinancesOrdersPage() {
  const userId = await getCurrentUserId();
  const items = await listAmazonItems(userId);

  return (
    <AppShell active="finances">
      <Suspense fallback={<div className="min-h-0 flex-1" />}>
        <AmazonOrdersView initialItems={items} />
      </Suspense>
    </AppShell>
  );
}
