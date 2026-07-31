import { getCurrentUserId } from "@/lib/auth";
import { loadDay } from "@/lib/day/queries";
import { loadSchedule } from "@/lib/schedule/queries";
import { fromDateKey, toDateKey } from "@/lib/schedule/geometry";
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

  const today = toDateKey(new Date());
  const day = params.date ?? today;

  // The schedule query works a week at a time; the day's appointments are filtered out of
  // it client-side rather than adding a second query path for one day.
  const [payload, schedule] = await Promise.all([
    loadDay(userId, day, today),
    loadSchedule(userId, { weekStart: fromDateKey(day) }),
  ]);

  const appointments = schedule.occurrences
    .filter((occurrence) => toDateKey(occurrence.startAt) === day)
    .map((occurrence) => ({
      id: occurrence.occurrenceKey,
      subject: occurrence.subject,
      startAt: occurrence.startAt,
      endAt: occurrence.endAt,
      allDay: occurrence.allDay,
      checkState: occurrence.checkState,
    }));

  return (
    <AppShell active="day">
      <DayView initial={payload} today={today} appointments={appointments} />
    </AppShell>
  );
}
