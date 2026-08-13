import { getCurrentUserId } from "@/lib/auth";
import { appointmentsForDay } from "@/lib/day/appointments";
import { loadDay } from "@/lib/day/queries";
import { loadSchedule } from "@/lib/schedule/queries";
import { fromDateKey, localDateKey } from "@/lib/schedule/geometry";
import { weekRange } from "@/lib/schedule/range";
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

  // The schedule query works a week at a time; the day's appointments are filtered out of
  // it rather than adding a second query path for one day.
  const [payload, schedule] = await Promise.all([
    loadDay(userId, day, today),
    loadSchedule(userId, { range: weekRange(fromDateKey(day)) }),
  ]);

  const appointments = appointmentsForDay(schedule.occurrences, day);

  return (
    <AppShell active="day">
      <DayView initial={payload} today={today} appointments={appointments} />
    </AppShell>
  );
}
