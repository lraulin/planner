import { Suspense } from "react";
import { getCurrentUserId } from "@/lib/auth";
import { plannedNodeIds } from "@/lib/day/queries";
import { loadOutline } from "@/lib/tree/queries";
import { ChooserGrid } from "@/components/chooser/ChooserGrid";

export const dynamic = "force-dynamic";
/**
 * The browser may show this payload again for 60 s. Must agree with `cachePolicy.ts`, which
 * says why this page qualifies; a test fails if the two drift.
 */
export const unstable_dynamicStaleTime = 60;

export default async function ChooserPage() {
  const userId = await getCurrentUserId();
  const [nodes, planned] = await Promise.all([
    loadOutline(userId),
    plannedNodeIds(userId),
  ]);

  return (
    <Suspense fallback={<div className="min-h-0 flex-1" />}>
      <ChooserGrid initialNodes={nodes} plannedNodeIds={[...planned]} />
    </Suspense>
  );
}
