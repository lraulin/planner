import { getCurrentUserId } from "@/lib/auth";
import { loadSchedule } from "@/lib/schedule/queries";
import { loadOutline } from "@/lib/tree/queries";
import { AppShell } from "@/components/shell/AppShell";
import { ScheduleView } from "@/components/schedule/ScheduleView";
import { fromDateKey, startOfWeek, toDateKey } from "@/lib/schedule/geometry";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ week?: string; chart?: string }>;

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const userId = await getCurrentUserId();

  const weekStart = params.week
    ? startOfWeek(fromDateKey(params.week), 0)
    : startOfWeek(new Date(), 0);

  const [schedule, nodes] = await Promise.all([
    loadSchedule(userId, {
      weekStart,
      timeChartId: params.chart ?? null,
    }),
    loadOutline(userId),
  ]);

  return (
    <AppShell active="schedule">
      <ScheduleView initial={schedule} nodes={nodes} weekKey={toDateKey(weekStart)} />
    </AppShell>
  );
}
