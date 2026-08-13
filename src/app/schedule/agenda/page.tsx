import { ScheduleRangePage, type ScheduleRangeSearchParams } from "../rangePage";

export const dynamic = "force-dynamic";

/** The Agenda page: the same days as a list, with days left. */
export default async function ScheduleAgendaPage({
  searchParams,
}: {
  searchParams: Promise<ScheduleRangeSearchParams>;
}) {
  return <ScheduleRangePage page="agenda" params={await searchParams} />;
}
