import { Suspense } from "react";
import { getCurrentUserId } from "@/lib/auth";
import { plannedNodeIds } from "@/lib/day/queries";
import { loadOutline } from "@/lib/tree/queries";
import { AppShell } from "@/components/shell/AppShell";
import { ChooserGrid } from "@/components/chooser/ChooserGrid";

export const dynamic = "force-dynamic";

export default async function ChooserPage() {
  const userId = await getCurrentUserId();
  const [nodes, planned] = await Promise.all([
    loadOutline(userId),
    plannedNodeIds(userId),
  ]);

  return (
    <AppShell active="chooser">
      <Suspense fallback={<div className="min-h-0 flex-1" />}>
        <ChooserGrid initialNodes={nodes} plannedNodeIds={[...planned]} />
      </Suspense>
    </AppShell>
  );
}
