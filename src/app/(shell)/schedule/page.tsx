import { moduleEntryRedirect } from "@/components/shell/moduleEntry";
import { SCHEDULE_RANGE_PARAMS, type ScheduleRangeSearchParams } from "./rangePage";

/** The pages that read `ScheduleRangeSearchParams`. Day takes `?date=`, Week Plan `?week=`. */
const RANGE_PAGES = ["calendar", "agenda"];

export const dynamic = "force-dynamic";

/**
 * The Schedule entry point. Renders nothing — Day, Calendar, Agenda and Week Plan are the pages.
 *
 * The query is carried through rather than dropped: `Schedule block…` on any grid row sends
 * `/schedule?block=<id>`, and `?start=` / `?week=` are in bookmarks going back to when this
 * route was the calendar itself. Only Calendar and Agenda read those, so a link carrying one
 * goes to whichever of the two you last used rather than to a remembered Day or Time Charts.
 */
export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<ScheduleRangeSearchParams>;
}) {
  const params = await searchParams;
  const ranged = SCHEDULE_RANGE_PARAMS.some((key) => params[key] !== undefined);
  await moduleEntryRedirect("schedule", params, ranged ? RANGE_PAGES : undefined);
}
