import { ScheduleRangePage, type ScheduleRangeSearchParams } from "../rangePage";

export const dynamic = "force-dynamic";

/** The Calendar page: time blocks on a grid. */
export default async function ScheduleCalendarPage({
  searchParams,
}: {
  searchParams: Promise<ScheduleRangeSearchParams>;
}) {
  return <ScheduleRangePage page="calendar" params={await searchParams} />;
}
