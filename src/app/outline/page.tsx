import { Suspense } from "react";
import { getCurrentUserId } from "@/lib/auth";
import { loadOutline } from "@/lib/tree/queries";
import { OutlineGrid } from "@/components/outline/OutlineGrid";
import { AppShell } from "@/components/shell/AppShell";

export const dynamic = "force-dynamic";

export default async function OutlinePage() {
  const userId = await getCurrentUserId();
  const nodes = await loadOutline(userId);

  return (
    <AppShell active="outline">
      <Suspense fallback={<div className="min-h-0 flex-1" />}>
        <OutlineGrid initialNodes={nodes} />
      </Suspense>
    </AppShell>
  );
}
