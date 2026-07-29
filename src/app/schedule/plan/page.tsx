import { getCurrentUserId } from "@/lib/auth";
import { loadWeeklyPlanPayload } from "@/lib/planning/queries";
import { fromDateKey, startOfWeek, toDateKey } from "@/lib/schedule/geometry";
import { TabStrip } from "@/components/shell/TabStrip";
import { WeeklyPlanView } from "@/components/planning/WeeklyPlanView";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ week?: string; start?: string; step?: string }>;

export default async function WeeklyPlanPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const userId = await getCurrentUserId();

  const weekStartsOn = params.start === "1" ? 1 : 0;
  const requested = params.week ? fromDateKey(params.week) : new Date();
  const weekStart = startOfWeek(requested, weekStartsOn);
  const step = Number(params.step ?? 0);

  const payload = await loadWeeklyPlanPayload(userId, { weekStart, weekStartsOn });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <TabStrip active="schedule" />
      <WeeklyPlanView
        payload={payload}
        weekKey={toDateKey(weekStart)}
        step={Number.isInteger(step) && step >= 0 && step <= 5 ? step : 0}
      />
    </div>
  );
}
