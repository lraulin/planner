import { Suspense } from "react";
import { getCurrentUserId } from "@/lib/auth";
import { listTimeChartSummaries } from "@/lib/schedule/queries";
import { AppShell } from "@/components/shell/AppShell";
import { TimeChartsView } from "@/components/schedule/TimeChartsView";

export const dynamic = "force-dynamic";

export default async function TimeChartsPage() {
  const userId = await getCurrentUserId();
  const charts = await listTimeChartSummaries(userId);

  return (
    <AppShell active="time-charts">
      <Suspense fallback={<div className="min-h-0 flex-1" />}>
        <TimeChartsView initialCharts={charts} />
      </Suspense>
    </AppShell>
  );
}
