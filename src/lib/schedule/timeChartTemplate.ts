/**
 * Time Chart editor uses a fixed “template week” (Sunday–Saturday, no real dates).
 * Areas expand to one FullCalendar event per selected weekday.
 */

import type { TimeChartArea } from "@/db/schema";
import { atMinutes, minutesOfDay, normalizeTimeRange } from "./geometry";

/** A fixed local Sunday — only weekdays matter; the calendar never shows the year. */
export const TIME_CHART_TEMPLATE_WEEK_START = new Date(2024, 0, 7);

export type TemplateAreaEvent = {
  /** `${areaId}:${weekday}` */
  id: string;
  areaId: string;
  title: string;
  start: Date;
  end: Date;
  backgroundColor: string;
  textColor: string;
  weekday: number;
};

export function expandAreasForTemplate(
  areas: TimeChartArea[],
  weekStart: Date = TIME_CHART_TEMPLATE_WEEK_START,
): TemplateAreaEvent[] {
  const out: TemplateAreaEvent[] = [];
  for (const area of areas) {
    for (const weekday of area.daysOfWeek) {
      if (weekday < 0 || weekday > 6) continue;
      const day = new Date(weekStart);
      day.setDate(weekStart.getDate() + weekday);
      day.setHours(0, 0, 0, 0);
      const start = atMinutes(day, area.startMinute);
      const end = new Date(start.getTime() + area.durationMinutes * 60_000);
      out.push({
        id: `${area.id}:${weekday}`,
        areaId: area.id,
        title: area.labelEnabled ? area.name || "(untitled)" : "",
        start,
        end,
        backgroundColor: area.backColor,
        textColor: area.foreColor,
        weekday,
      });
    }
  }
  return out;
}

export function rangeToAreaTiming(start: Date, end: Date) {
  const startMinute = minutesOfDay(start);
  const durationMinutes = Math.max(
    15,
    Math.round((end.getTime() - start.getTime()) / 60_000),
  );
  return normalizeTimeRange(startMinute, durationMinutes);
}

export function weekdayOfTemplateDate(
  date: Date,
  weekStart: Date = TIME_CHART_TEMPLATE_WEEK_START,
): number {
  // Prefer getDay() so DST shifts don't matter for column identity.
  void weekStart;
  return date.getDay();
}
