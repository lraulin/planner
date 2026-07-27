import { getCurrentUserId } from "@/lib/auth";
import { loadOutline } from "@/lib/tree/queries";
import { OutlineGrid } from "@/components/outline/OutlineGrid";
import { TabStrip } from "@/components/outline/TabStrip";

export const dynamic = "force-dynamic";

export default async function OutlinePage() {
  const userId = await getCurrentUserId();
  const nodes = await loadOutline(userId);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <TabStrip active="outline" />
      <OutlineGrid initialNodes={nodes} />
    </div>
  );
}
