import { notFound } from "next/navigation";
import { getCurrentUserId } from "@/lib/auth";
import { getTimeChart, listTimeChartAreas } from "@/lib/schedule/queries";
import { loadOutline } from "@/lib/tree/queries";
import { AppShell } from "@/components/shell/AppShell";
import { TimeChartEditorView } from "@/components/schedule/TimeChartEditorView";

export const dynamic = "force-dynamic";

type Params = Promise<{ chartId: string }>;
type SearchParams = Promise<{ returnTo?: string }>;

export default async function TimeChartEditorPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { chartId } = await params;
  const { returnTo } = await searchParams;
  const userId = await getCurrentUserId();

  const chart = await getTimeChart(userId, chartId);
  if (!chart) notFound();

  const [areas, nodes] = await Promise.all([
    listTimeChartAreas(userId, chartId),
    loadOutline(userId),
  ]);

  return (
    <AppShell active="time-charts">
      <TimeChartEditorView
        chart={chart}
        initialAreas={areas}
        nodes={nodes}
        returnTo={returnTo}
      />
    </AppShell>
  );
}
