import { Suspense } from "react";
import { getCurrentUserId } from "@/lib/auth";
import { loadSchedule } from "@/lib/schedule/queries";
import { loadOutline } from "@/lib/tree/queries";
import { AppShell } from "@/components/shell/AppShell";
import { ScheduleView, type SchedulePage } from "@/components/schedule/ScheduleView";
import { fromDateKey, localDateKey, startOfWeek } from "@/lib/schedule/geometry";
import { loadScheduleView, rangeForView } from "@/lib/schedule/viewRange";
import { isDateKey } from "@/lib/metrics/parse";

export type ScheduleRangeSearchParams = {
  start?: string;
  /** Pre-day-count links (`?week=`), still resolved so old bookmarks land on that week. */
  week?: string;
  chart?: string;
  block?: string;
};

/**
 * Which day the range is anchored on, as a calendar-day key.
 *
 * Validated rather than trusted: a malformed key decodes to an invalid Date, and in Work
 * Week Mode `scheduleRange` would then search forever for a weekday that never arrives.
 */
function anchorKeyFrom(params: { start?: string; week?: string }): string {
  if (params.start && isDateKey(params.start)) return params.start;
  if (params.week && isDateKey(params.week)) {
    return localDateKey(startOfWeek(fromDateKey(params.week), 0));
  }
  return localDateKey(new Date());
}

/**
 * Calendar and Agenda, which are one page's worth of loading drawn two ways.
 *
 * They are separate routes because each is a place you can be — linkable, reloadable, and
 * reachable with Back — but they read exactly the same range from exactly the same settings.
 * Two `page.tsx` files calling this is the shape that keeps the URLs honest without letting
 * the two drift into loading different days.
 */
export async function ScheduleRangePage({
  page,
  params,
}: {
  page: SchedulePage;
  params: ScheduleRangeSearchParams;
}) {
  const userId = await getCurrentUserId();

  /*
   * The URL carries where you are looking; the settings carry how much of it you see. That
   * split is why `?week=` had to become `?start=` — the same parameter now anchors a range
   * that may be one day or twenty, and calling it a week would be a lie in five cases out
   * of six.
   */
  const anchorKey = anchorKeyFrom(params);
  const view = await loadScheduleView();
  const range = rangeForView(fromDateKey(anchorKey), view);

  const [schedule, nodes] = await Promise.all([
    loadSchedule(userId, { range, timeChartId: params.chart ?? null }),
    loadOutline(userId),
  ]);

  return (
    <AppShell active="schedule">
      <Suspense fallback={<div className="min-h-0 flex-1" />}>
        <ScheduleView
          page={page}
          initial={schedule}
          nodes={nodes}
          anchorKey={anchorKey}
          // `Schedule block…` on any grid row lands here. See `ScheduleView`.
          blockNodeId={params.block ?? null}
        />
      </Suspense>
    </AppShell>
  );
}
