/**
 * Which days the schedule is showing.
 *
 * Achieve's Weekly Schedule is not a week — it is "however many days you asked for", from
 * its View menu: One / Three / Five / Seven / Ten / Twenty Days. This module answers the
 * only question that follows from that ("which days, starting where?") for both the server
 * loader and the calendar, because two implementations of that answer is one too many:
 * FullCalendar can compute its own visible columns, but the server has to load exactly the
 * same window or the grid draws days it has no appointments for.
 *
 * Pure — no I/O, unit-tested beside this file. See `agent-os/standards/development/dates.md`
 * for why every day here is a **local midnight** built with `setDate`, never an instant
 * shifted by `n * 86_400_000` (which loses or gains an hour across a DST boundary and can
 * land on the wrong calendar day).
 */

import { startOfWeek, WEEKDAYS_ONLY } from "./geometry";

/** Achieve's list, whole. `docs/achieve-planner/online-help.md:1634-1653`. */
export const DAY_COUNTS = [1, 3, 5, 7, 10, 20] as const;
export type DayCount = (typeof DAY_COUNTS)[number];

/**
 * Where the range starts.
 *
 * - `rolling` — on the anchor day, which is today unless you have navigated. Achieve's docs
 *   never state an anchor rule for the 3/10/20-day widths; this is Planner's answer, and the
 *   default, because a schedule of the past is not a schedule.
 * - `aligned` — on the start of the week containing the anchor, so seven days is the
 *   conventional Sun–Sat week the app drew before day counts existed.
 */
export const ANCHOR_MODES = ["rolling", "aligned"] as const;
export type AnchorMode = (typeof ANCHOR_MODES)[number];

export type RangeOptions = {
  dayCount: DayCount;
  anchorMode: AnchorMode;
  /** Achieve's Work Week Mode: Saturdays and Sundays are not shown. */
  workWeek: boolean;
  /** 0 = Sunday (Achieve's default). Only consulted in `aligned` mode. */
  weekStartsOn?: number;
};

export type ScheduleRange = {
  /** Local midnight of the first **visible** day. */
  start: Date;
  /**
   * Exclusive end — local midnight after the last visible day. In Work Week Mode this can
   * be more than `dayCount` days past `start`, because the hidden weekends still take up
   * calendar space between the columns.
   */
  end: Date;
  /** The visible day columns, in order. Always exactly `dayCount` long. */
  days: Date[];
};

export function isDayCount(value: unknown): value is DayCount {
  return (DAY_COUNTS as readonly number[]).includes(value as number);
}

export function isAnchorMode(value: unknown): value is AnchorMode {
  return (ANCHOR_MODES as readonly string[]).includes(value as string);
}

/**
 * The days the calendar draws for an anchor.
 *
 * **`dayCount` is a count of visible columns, not of calendar days.** In Work Week Mode
 * "Five Days" means Monday through Friday — Achieve's work week — not Sunday through
 * Thursday with two of them missing. That is the whole reason this is a loop and not
 * `start + n days`.
 */
export function scheduleRange(anchor: Date, opts: RangeOptions): ScheduleRange {
  const { dayCount, anchorMode, workWeek, weekStartsOn = 0 } = opts;

  const base =
    anchorMode === "aligned"
      ? startOfWeek(anchor, weekStartsOn)
      : localMidnight(anchor);

  // An invalid anchor has no weekday, so in Work Week Mode the loop below would search for
  // a Monday forever. Fail loudly instead of hanging the render; callers reading a date out
  // of a URL validate it first.
  if (Number.isNaN(base.getTime())) {
    throw new Error("scheduleRange: anchor is not a valid date");
  }

  const days: Date[] = [];
  const cursor = new Date(base);
  while (days.length < dayCount) {
    if (!workWeek || isWeekday(cursor)) days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  // `cursor` sits one day past the last day pushed, which is exactly the exclusive end.
  return { start: days[0], end: cursor, days };
}

/**
 * The anchor for the previous or next range.
 *
 * Rolling steps by **visible** days, so the ranges tile: the next one begins on the first
 * day the current one does not show, and stepping back and forward again returns where you
 * were. Aligned steps by a week, because that is what alignment means — at counts other
 * than seven this can overlap or skip a day at the seam, which is inherent to asking for a
 * ten-day window aligned to a seven-day grid.
 *
 * The returned anchor is deliberately **not** snapped onto a visible day. Snapping would
 * make forward-then-back land somewhere other than where it started, and `scheduleRange`
 * normalizes a weekend anchor anyway.
 */
export function stepAnchor(anchor: Date, direction: -1 | 1, opts: RangeOptions): Date {
  if (opts.anchorMode === "aligned") {
    const base = startOfWeek(anchor, opts.weekStartsOn ?? 0);
    base.setDate(base.getDate() + direction * 7);
    return base;
  }

  const { days } = scheduleRange(anchor, opts);
  return direction === 1
    ? shiftVisible(days[days.length - 1], 1, opts.workWeek)
    : shiftVisible(days[0], -opts.dayCount, opts.workWeek);
}

/**
 * The seven-day, week-aligned range the app drew before day counts existed.
 *
 * For the surfaces that genuinely mean "a week" — the planning wizard, the agent's
 * `schedule.week` tools — rather than "whatever the calendar is currently showing".
 */
export function weekRange(anchor: Date, weekStartsOn = 0): ScheduleRange {
  return scheduleRange(anchor, {
    dayCount: 7,
    anchorMode: "aligned",
    workWeek: false,
    weekStartsOn,
  });
}

/** A single calendar day, for the Day tab. */
export function dayRange(day: Date): ScheduleRange {
  return scheduleRange(day, { dayCount: 1, anchorMode: "rolling", workWeek: false });
}

/** Local midnight of a date's own calendar day. Same idiom as `startOfWeek`. */
function localMidnight(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setHours(0, 0, 0, 0);
  return d;
}

function isWeekday(date: Date): boolean {
  return (WEEKDAYS_ONLY as readonly number[]).includes(date.getDay());
}

/** Move `count` **visible** days from `from` (negative moves backwards). */
function shiftVisible(from: Date, count: number, workWeek: boolean): Date {
  const step = count < 0 ? -1 : 1;
  const cursor = new Date(from);
  let remaining = Math.abs(count);
  while (remaining > 0) {
    cursor.setDate(cursor.getDate() + step);
    if (!workWeek || isWeekday(cursor)) remaining -= 1;
  }
  return cursor;
}
