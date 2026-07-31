import { Suspense } from "react";
import { getCurrentUserId } from "@/lib/auth";
import { loadOutline } from "@/lib/tree/queries";
import { loadWishList } from "@/lib/detail/wishQueries";
import { TabStrip } from "@/components/shell/TabStrip";
import { WishesGrid } from "@/components/tabs/WishesGrid";

export const dynamic = "force-dynamic";

export default async function WishesPage() {
  const userId = await getCurrentUserId();
  const [nodes, wishes] = await Promise.all([
    loadOutline(userId),
    loadWishList(userId),
  ]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <TabStrip active="wishes" />
      <Suspense fallback={<div className="min-h-0 flex-1" />}>
        <WishesGrid initialWishes={wishes} initialNodes={nodes} />
      </Suspense>
    </div>
  );
}
