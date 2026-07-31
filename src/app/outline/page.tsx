import { Suspense } from "react";
import { getCurrentUserId } from "@/lib/auth";
import { loadOutline } from "@/lib/tree/queries";
import { OutlineGrid } from "@/components/outline/OutlineGrid";
import { TabStrip } from "@/components/shell/TabStrip";

export const dynamic = "force-dynamic";

export default async function OutlinePage() {
  const userId = await getCurrentUserId();
  const nodes = await loadOutline(userId);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <TabStrip active="outline" />
      <Suspense fallback={<div className="min-h-0 flex-1" />}>
        <OutlineGrid initialNodes={nodes} />
      </Suspense>
    </div>
  );
}
