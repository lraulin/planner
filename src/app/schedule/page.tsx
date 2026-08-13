import { moduleEntryRedirect } from "@/components/shell/moduleEntry";
import type { ScheduleRangeSearchParams } from "./rangePage";

export const dynamic = "force-dynamic";

/**
 * The Schedule entry point. Renders nothing — Day, Calendar, Agenda and Week Plan are the pages.
 *
 * The query is carried through rather than dropped: `Schedule block…` on any grid row sends
 * `/schedule?block=<id>`, and `?start=` / `?week=` are in bookmarks going back to when this
 * route was the calendar itself.
 */
export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<ScheduleRangeSearchParams>;
}) {
  await moduleEntryRedirect("schedule", await searchParams);
}
