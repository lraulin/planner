/**
 * The range the Weekly Schedule is currently showing, resolved on the server.
 *
 * Day count and anchor mode are stored settings rather than URL state (the URL carries the
 * anchor date and nothing else — see `agent-os/specs/2026-07-31-1520-persistent-ui-state`),
 * so the page and the Refresh action both have to read the same preferences to arrive at
 * the same days. Anywhere that computes the range from a guess instead of from this is a
 * grid drawing columns nothing was loaded for.
 */

import { parseScheduleView, type ScheduleViewSettings } from "@/lib/settings/schedule";
import { SCHEDULE_SCOPE } from "@/lib/settings/scopes";
import { loadSettingsForSession } from "@/lib/settings/session";
import { scheduleRange, type ScheduleRange } from "./range";

/** The `schedule` scope, parsed. Shares the layout's settings round trip. */
export async function loadScheduleView(): Promise<ScheduleViewSettings> {
  const snapshot = await loadSettingsForSession();
  return parseScheduleView(snapshot[SCHEDULE_SCOPE]);
}

export function rangeForView(anchor: Date, view: ScheduleViewSettings): ScheduleRange {
  return scheduleRange(anchor, {
    dayCount: view.dayCount,
    anchorMode: view.anchorMode,
    workWeek: view.workWeek,
  });
}
