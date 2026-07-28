/**
 * Expand recurring appointments into concrete occurrences for a visible window.
 * Pure — no I/O. Occurrences are not stored; only the series master is.
 */

import type { Appointment, RecurrenceEnd, RecurrenceFrequency } from "@/db/schema";
import { toDateKey } from "./geometry";

export type Occurrence = {
  /** Master appointment id. */
  id: string;
  /** Stable key for this occurrence (id + start ISO). */
  occurrenceKey: string;
  subject: string;
  startAt: Date;
  endAt: Date;
  allDay: boolean;
  completed: boolean;
  projectId: string | null;
  isRecurring: boolean;
};

export type RecurrenceInput = {
  id: string;
  subject: string;
  startAt: Date;
  endAt: Date;
  allDay: boolean;
  completed: boolean;
  projectId: string | null;
  recurrenceFrequency: RecurrenceFrequency;
  recurrenceInterval: number;
  recurrenceByWeekday: number[] | null;
  recurrenceEnd: RecurrenceEnd;
  recurrenceCount: number | null;
  recurrenceUntil: Date | null;
};

const MS_DAY = 24 * 60 * 60 * 1000;

function durationMs(start: Date, end: Date): number {
  return Math.max(0, end.getTime() - start.getTime());
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  // Clamp end-of-month overflow (Jan 31 + 1 month → Mar 3 → last day of Feb).
  if (d.getDate() !== day) {
    d.setDate(0);
  }
  return d;
}

function addYears(date: Date, years: number): Date {
  return addMonths(date, years * 12);
}

function occurrenceOf(
  master: RecurrenceInput,
  start: Date,
): Occurrence {
  const end = new Date(start.getTime() + durationMs(master.startAt, master.endAt));
  return {
    id: master.id,
    occurrenceKey: `${master.id}@${start.toISOString()}`,
    subject: master.subject,
    startAt: start,
    endAt: end,
    allDay: master.allDay,
    completed: master.completed,
    projectId: master.projectId,
    isRecurring: master.recurrenceFrequency !== "none",
  };
}

function inWindow(start: Date, end: Date, rangeStart: Date, rangeEnd: Date): boolean {
  return start < rangeEnd && end > rangeStart;
}

function pastSeriesEnd(
  master: RecurrenceInput,
  start: Date,
  index: number,
): boolean {
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

    // Fast-forward roughly.
    while (start < rangeStart && index < maxOccurrences) {
      const next = step(start);
      if (next.getTime() === start.getTime()) break;
      start = next;
      index++;
    }
    // One step back if we overshot (so we don't miss the first in-window).
    if (index > 0 && start > rangeStart) {
      // re-walk from master if small; for safety just continue from here
    }

    // Safer: restart from master and skip until near window.
    start = new Date(master.startAt);
    index = 0;
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
    completed: a.completed,
    projectId: a.projectId,
    recurrenceFrequency: a.recurrenceFrequency,
    recurrenceInterval: a.recurrenceInterval,
    recurrenceByWeekday: a.recurrenceByWeekday,
    recurrenceEnd: a.recurrenceEnd,
    recurrenceCount: a.recurrenceCount,
    recurrenceUntil: a.recurrenceUntil,
  };
}

/**
 * Expand Time Chart areas into dated background instances for a week.
 * Areas use daysOfWeek (0=Sun…6=Sat) and startMinute/durationMinutes.
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
  weekStart: Date,
): Array<{
  id: string;
  areaId: string;
  title: string;
  start: Date;
  end: Date;
  backgroundColor: string;
  textColor: string;
  display: "background";
}> {
  const out: Array<{
    id: string;
    areaId: string;
    title: string;
    start: Date;
    end: Date;
    backgroundColor: string;
    textColor: string;
    display: "background";
  }> = [];

  for (let i = 0; i < 7; i++) {
    const day = new Date(weekStart);
    day.setDate(weekStart.getDate() + i);
    day.setHours(0, 0, 0, 0);
    const weekday = day.getDay();

    for (const area of areas) {
      if (!area.daysOfWeek.includes(weekday)) continue;
      const start = new Date(day);
      start.setHours(0, 0, 0, 0);
      start.setMinutes(area.startMinute);
      const end = new Date(start.getTime() + area.durationMinutes * 60_000);
      out.push({
        id: `tca:${area.id}:${toDateKey(day)}`,
        areaId: area.id,
        title: area.labelEnabled ? area.name : "",
        start,
        end,
        backgroundColor: area.backColor,
        textColor: area.foreColor,
        display: "background",
      });
    }
  }

  return out;
}
