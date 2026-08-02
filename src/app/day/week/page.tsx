import { getCurrentUserId } from "@/lib/auth";
import { loadWeek } from "@/lib/day/queries";
import { loadOutline } from "@/lib/tree/queries";
import {
  fromDateKey,
  localDateKey,
  startOfWeek,
  toDateKey,
} from "@/lib/schedule/geometry";
import { AppShell } from "@/components/shell/AppShell";
import { WeekPlanView } from "@/components/day/WeekPlanView";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ week?: string }>;

export default async function WeekPlanPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const userId = await getCurrentUserId();

  const weekStart = startOfWeek(
    params.week ? fromDateKey(params.week) : new Date(),
    // Sunday, matching the Weekly Schedule tab's default.
    0,
  );
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);

  // The master rail is the Task Chooser's To-do List, built client-side from the outline —
  // the same `buildChooserItems` the chooser tab uses, so the two lists cannot drift.
  const [payload, nodes] = await Promise.all([
    loadWeek(userId, toDateKey(weekStart), toDateKey(weekEnd)),
    loadOutline(userId),
  ]);

  return (
    <AppShell active="day">
      <WeekPlanView initial={payload} nodes={nodes} today={localDateKey(new Date())} />
    </AppShell>
  );
}
