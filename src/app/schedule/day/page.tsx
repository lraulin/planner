import { getCurrentUserId } from "@/lib/auth";
import { appointmentsForDay } from "@/lib/day/appointments";
import { loadDay } from "@/lib/day/queries";
import { loadSchedule } from "@/lib/schedule/queries";
import { fromDateKey, localDateKey } from "@/lib/schedule/geometry";
import { dayRange } from "@/lib/schedule/range";
import { AppShell } from "@/components/shell/AppShell";
import { DayView } from "@/components/day/DayView";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ date?: string }>;

export default async function DayPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const userId = await getCurrentUserId();

  const today = localDateKey(new Date());
  const day = params.date ?? today;

  // One day of occurrences, not a week to slice down: dayRange is the schedule helper
  // written for this tab, and appointmentsForDay still applies the wall-clock rule.
  const [payload, schedule] = await Promise.all([
    loadDay(userId, day, today),
    loadSchedule(userId, { range: dayRange(fromDateKey(day)) }),
  ]);

  const appointments = appointmentsForDay(schedule.occurrences, day);

  return (
    <AppShell active="schedule">
      <DayView initial={payload} today={today} appointments={appointments} />
    </AppShell>
  );
}
