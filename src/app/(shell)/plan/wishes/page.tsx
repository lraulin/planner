import { Suspense } from "react";
import { getCurrentUserId } from "@/lib/auth";
import { loadOutline } from "@/lib/tree/queries";
import { loadWishList } from "@/lib/detail/wishQueries";
import { WishesGrid } from "@/components/tabs/WishesGrid";

export const dynamic = "force-dynamic";
/**
 * The browser may show this payload again for 60 s. Must agree with `cachePolicy.ts`, which
 * says why this page qualifies; a test fails if the two drift.
 */
export const unstable_dynamicStaleTime = 60;

export default async function WishesPage() {
  const userId = await getCurrentUserId();
  const [nodes, wishes] = await Promise.all([
    loadOutline(userId),
    loadWishList(userId),
  ]);

  return (
    <Suspense fallback={<div className="min-h-0 flex-1" />}>
      <WishesGrid initialWishes={wishes} initialNodes={nodes} />
    </Suspense>
  );
}
