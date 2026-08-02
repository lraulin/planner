import { Suspense } from "react";
import { getCurrentUserId } from "@/lib/auth";
import { listMetrics } from "@/lib/metrics/queries";
import { loadOutline } from "@/lib/tree/queries";
import { AppShell } from "@/components/shell/AppShell";
import { MetricsView } from "@/components/metrics/MetricsView";

export const dynamic = "force-dynamic";

export default async function MetricsPage() {
  const userId = await getCurrentUserId();
  const [metrics, nodes] = await Promise.all([
    listMetrics(userId),
    loadOutline(userId),
  ]);
  const goals = nodes.filter((n) => n.type === "goal");

  return (
    <AppShell active="metrics">
      <Suspense fallback={<div className="min-h-0 flex-1" />}>
        <MetricsView initialMetrics={metrics} goals={goals} />
      </Suspense>
    </AppShell>
  );
}
