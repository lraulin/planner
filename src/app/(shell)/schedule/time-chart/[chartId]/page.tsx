import { notFound } from "next/navigation";
import { getCurrentUserId } from "@/lib/auth";
import { getTimeChart, listTimeChartAreas } from "@/lib/schedule/queries";
import { loadOutline } from "@/lib/tree/queries";
import { timeChartResultAreasWire } from "@/lib/tree/wireSlices";
import { internalPath } from "@/lib/navigation/internalPath";
import { TimeChartEditorView } from "@/components/schedule/TimeChartEditorView";

export const dynamic = "force-dynamic";

type Params = Promise<{ chartId: string }>;
type SearchParams = Promise<{ returnTo?: string | string[] }>;

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
    <TimeChartEditorView
      chart={chart}
      initialAreas={areas}
      nodesWire={timeChartResultAreasWire(nodes)}
      // A link can carry any `returnTo`, and the editor's Back button follows it.
      returnTo={internalPath(returnTo)}
    />
  );
}
