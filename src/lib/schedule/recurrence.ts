/**
 * Expand recurring appointments into concrete occurrences for a visible window.
 * Pure — no I/O. Occurrences are not stored; only the series master is.
 */

import type {
  Appointment,
  AppointmentCheck,
  RecurrenceEnd,
  RecurrenceFrequency,
} from "@/db/schema";
import { addDays, addMonths, addYears } from "@/lib/dateMath";
import { floatingDateTime, toDateKey, weekdayOfDateKey } from "./geometry";

export type Occurrence = {
  /** Master appointment id. */
  id: string;
  /** Stable key for this occurrence (id + start ISO). */
  occurrenceKey: string;
  subject: string;
  startAt: Date;
  endAt: Date;
  allDay: boolean;
  checkState: AppointmentCheck;
  projectId: string | null;
  isRecurring: boolean;
};

export type RecurrenceInput = {
  id: string;
  subject: string;
  startAt: Date;
  endAt: Date;
  allDay: boolean;
  checkState: AppointmentCheck;
  projectId: string | null;
  recurrenceFrequency: RecurrenceFrequency;
  recurrenceInterval: number;
  recurrenceByWeekday: number[] | null;
  recurrenceEnd: RecurrenceEnd;
  recurrenceCount: number | null;
  recurrenceUntil: Date | null;
  /**
   * Google `recurringEventId`. Instances are stored with `recurrenceFrequency = "none"`
   * because Google expands the series; this is what still marks them as repeating.
   */
  externalSeriesId?: string | null;
};

const MS_DAY = 24 * 60 * 60 * 1000;

/**
 * Whether this row is part of a series. Google instances keep `recurrenceFrequency`
 * at `"none"` on purpose (the mirror stores one concrete day, not a rule), so the
 * series id is the only local signal they repeat.
 */
export function appointmentIsRecurring(appointment: {
  recurrenceFrequency: RecurrenceFrequency;
  externalSeriesId?: string | null;
}): boolean {
  return (
    appointment.recurrenceFrequency !== "none" || Boolean(appointment.externalSeriesId)
  );
}

/** Collapsed recurrence-header label. Google series have no local rule to describe. */
export function appointmentRecurrenceSummary(appointment: {
  recurrenceFrequency: RecurrenceFrequency;
  recurrenceInterval: number;
  externalSeriesId?: string | null;
}): string {
  if (appointment.externalSeriesId) return "Repeats in Google Calendar";
  if (appointment.recurrenceFrequency === "none") return "Does not repeat";
  const n = Math.max(1, appointment.recurrenceInterval || 1);
  const unit = {
    daily: "day",
    weekly: "week",
    monthly: "month",
    yearly: "year",
  }[appointment.recurrenceFrequency];
  return n === 1 ? `Every ${unit}` : `Every ${n} ${unit}s`;
}

function durationMs(start: Date, end: Date): number {
  return Math.max(0, end.getTime() - start.getTime());
}

function occurrenceOf(master: RecurrenceInput, start: Date): Occurrence {
  const end = new Date(start.getTime() + durationMs(master.startAt, master.endAt));
  return {
    id: master.id,
    occurrenceKey: `${master.id}@${start.toISOString()}`,
    subject: master.subject,
    startAt: start,
    endAt: end,
    allDay: master.allDay,
    checkState: master.checkState,
    projectId: master.projectId,
    isRecurring: appointmentIsRecurring(master),
  };
}

function inWindow(start: Date, end: Date, rangeStart: Date, rangeEnd: Date): boolean {
  return start < rangeEnd && end > rangeStart;
}

function pastSeriesEnd(master: RecurrenceInput, start: Date, index: number): boolean {
  if (master.recurrenceEnd === "count" && master.recurrenceCount != null) {
    return index >= master.recurrenceCount;
  }
  if (master.recurrenceEnd === "until" && master.recurrenceUntil) {
    // Inclusive of the until date's calendar day.
    return toDateKey(start) > toDateKey(master.recurrenceUntil);
  }
  return false;
}

/**
 * Expand one appointment (or series master) into occurrences that overlap
 * [rangeStart, rangeEnd). Caps iterations so runaway rules cannot hang the UI.
 */
export function expandRecurrence(
  master: RecurrenceInput,
  rangeStart: Date,
  rangeEnd: Date,
  maxOccurrences = 500,
): Occurrence[] {
  const interval = Math.max(1, master.recurrenceInterval || 1);
  const freq = master.recurrenceFrequency;

  if (freq === "none") {
    if (inWindow(master.startAt, master.endAt, rangeStart, rangeEnd)) {
      return [occurrenceOf(master, master.startAt)];
    }
    return [];
  }

  const out: Occurrence[] = [];
  const duration = durationMs(master.startAt, master.endAt);

  // Safety: do not walk from a series start decades before the window forever.
  // Jump near the range when possible.
  let index = 0;

  if (freq === "daily") {
    let start = new Date(master.startAt);
    // Fast-forward to near rangeStart.
    if (start < rangeStart) {
      const daysBehind = Math.floor((rangeStart.getTime() - start.getTime()) / MS_DAY);
      const steps = Math.floor(daysBehind / interval);
      start = addDays(start, steps * interval);
      index = steps;
      while (start < rangeStart && index < maxOccurrences) {
        start = addDays(start, interval);
        index++;
      }
    }

    while (index < maxOccurrences) {
      if (pastSeriesEnd(master, start, index)) break;
      if (start >= rangeEnd) break;
      const end = new Date(start.getTime() + duration);
      if (inWindow(start, end, rangeStart, rangeEnd)) {
        out.push(occurrenceOf(master, new Date(start)));
      }
      start = addDays(start, interval);
      index++;
    }
    return out;
  }

  if (freq === "weekly") {
    const weekdays =
      master.recurrenceByWeekday && master.recurrenceByWeekday.length > 0
        ? [...new Set(master.recurrenceByWeekday)].sort((a, b) => a - b)
        : [master.startAt.getDay()];

    // Anchor: the week containing the series start (Sunday-based for index math).
    const seriesWeekStart = new Date(master.startAt);
    seriesWeekStart.setHours(0, 0, 0, 0);
    seriesWeekStart.setDate(seriesWeekStart.getDate() - seriesWeekStart.getDay());

    const timeH = master.startAt.getHours();
    const timeM = master.startAt.getMinutes();
    const timeS = master.startAt.getSeconds();
    const timeMs = master.startAt.getMilliseconds();

    // Walk week by week from series start.
    let weekIndex = 0;
    // Fast-forward weeks.
    if (seriesWeekStart < rangeStart) {
      const weeksBehind = Math.floor(
        (rangeStart.getTime() - seriesWeekStart.getTime()) / (7 * MS_DAY),
      );
      weekIndex = Math.floor(weeksBehind / interval) * interval;

      // Carry the occurrence tally across the weeks we just jumped over. Without this,
      // `index` restarts at 0 inside the window, so an "end after N" series is reborn
      // every time it is scrolled to — a weekly series with count 3 kept emitting
      // occurrences years after it ended. The anchor week is partial: weekdays before
      // the series start never happened and must not be counted.
      const weeksIterated = weekIndex / interval;
      const beforeSeriesStart = weekdays.filter(
        (wd) => wd < master.startAt.getDay(),
      ).length;
      index = Math.max(0, weeksIterated * weekdays.length - beforeSeriesStart);
    }

    while (out.length < maxOccurrences && weekIndex < maxOccurrences * 2) {
      const weekStart = addDays(seriesWeekStart, weekIndex * 7);
      if (weekStart >= rangeEnd) break;

      // Count occurrences in series order for end-after-N.
      for (const wd of weekdays) {
        const day = addDays(weekStart, wd);
        day.setHours(timeH, timeM, timeS, timeMs);
        if (day < master.startAt) continue;
        if (pastSeriesEnd(master, day, index)) return out;
        const end = new Date(day.getTime() + duration);
        if (inWindow(day, end, rangeStart, rangeEnd)) {
          out.push(occurrenceOf(master, day));
        }
        index++;
        if (index >= maxOccurrences) return out;
      }
      weekIndex += interval;
    }
    return out;
  }

  if (freq === "monthly" || freq === "yearly") {
    let start = new Date(master.startAt);
    const step = (d: Date) =>
      freq === "monthly" ? addMonths(d, interval) : addYears(d, interval);

    // No fast-forward here, unlike daily and weekly: month lengths vary, so the only
    // way to land on the right dates is to walk every step from the series start. That
    // caps reach at `maxOccurrences` steps — about 41 years of monthly recurrence.
    while (index < maxOccurrences) {
      if (pastSeriesEnd(master, start, index)) break;
      if (start >= rangeEnd) break;
      const end = new Date(start.getTime() + duration);
      if (inWindow(start, end, rangeStart, rangeEnd)) {
        out.push(occurrenceOf(master, new Date(start)));
      }
      const next = step(start);
      if (next.getTime() === start.getTime()) break;
      start = next;
      index++;
    }
    return out;
  }

  return out;
}

export function appointmentToRecurrenceInput(a: Appointment): RecurrenceInput {
  return {
    id: a.id,
    subject: a.subject,
    startAt: a.startAt,
    endAt: a.endAt,
    allDay: a.allDay,
    checkState: a.checkState,
    projectId: a.projectId,
    recurrenceFrequency: a.recurrenceFrequency,
    recurrenceInterval: a.recurrenceInterval,
    recurrenceByWeekday: a.recurrenceByWeekday,
    recurrenceEnd: a.recurrenceEnd,
    recurrenceCount: a.recurrenceCount,
    recurrenceUntil: a.recurrenceUntil,
    externalSeriesId: a.externalSeriesId,
  };
}

/**
 * One Time Chart area, placed on a calendar day.
 *
 * `start` / `end` are floating local datetimes (`YYYY-MM-DDTHH:mm:00`), not instants.
 * The server must not turn startMinute into a `Date` — that stamps the process zone
 * and is how a 9am block became 5am Eastern on Vercel. The client parses these with
 * `parseFloatingDateTime` in the user's zone.
 */
export type TimeChartBackgroundEvent = {
  id: string;
  areaId: string;
  title: string;
  start: string;
  end: string;
  backgroundColor: string;
  textColor: string;
  display: "background";
};

/**
 * Expand Time Chart areas into dated background instances for the days on screen.
 * Areas use daysOfWeek (0=Sun…6=Sat) and startMinute/durationMinutes.
 *
 * Takes the visible day keys rather than `Date`s: the calendar's range can be one day
 * or twenty, Work Week Mode skips weekends, and a Date's weekday/`setHours` follow
 * the process timezone. Keys do not.
 */
export function expandTimeChartAreas(
  areas: Array<{
    id: string;
    name: string;
    daysOfWeek: number[];
    startMinute: number;
    durationMinutes: number;
    backColor: string;
    foreColor: string;
    labelEnabled: boolean;
  }>,
  dayKeys: readonly string[],
): TimeChartBackgroundEvent[] {
  const out: TimeChartBackgroundEvent[] = [];

  for (const dayKey of dayKeys) {
    const weekday = weekdayOfDateKey(dayKey);

    for (const area of areas) {
      if (!area.daysOfWeek.includes(weekday)) continue;
      out.push({
        id: `tca:${area.id}:${dayKey}`,
        areaId: area.id,
        title: area.labelEnabled ? area.name : "",
        start: floatingDateTime(dayKey, area.startMinute),
        end: floatingDateTime(dayKey, area.startMinute + area.durationMinutes),
        backgroundColor: area.backColor,
        textColor: area.foreColor,
        display: "background",
      });
    }
  }

  return out;
}
