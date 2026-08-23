/**
 * Recurrence expansion for Actual-style schedules, in pure `YYYY-MM-DD` math.
 *
 * **Reimplemented from Actual Budget** — `packages/loot-core/src/shared/schedules.ts`
 * (`recurConfigToRSchedule`, `getNextDate`, `getDateWithSkippedWeekend`) and
 * `packages/loot-core/src/types/models/schedule.ts` (MIT, © James Long). Actual expands
 * `RecurConfig` through rschedule / date-fns, which this repo forbids
 * (`agent-os/standards/development/dates.md`). The **config shape** is theirs byte-for-byte;
 * only the expansion is rewritten over day keys.
 *
 * Spec: `agent-os/specs/2026-08-22-2124-actual-schedules/` D5.
 */

import { daysInMonth } from "@/lib/dateMath";
import { shiftDateKey, weekdayOfDateKey } from "@/lib/schedule/geometry";

/**
 * Copied from `../actual/packages/loot-core/src/types/models/schedule.ts`.
 *
 * `type: 'day'` is a day of the month (negative counts from the end). The two-letter
 * codes are weekdays, with `value` the nth occurrence (`2` = second, `-1` = last).
 */
export type RecurPattern = {
  value: number;
  type: "SU" | "MO" | "TU" | "WE" | "TH" | "FR" | "SA" | "day";
};

/** Copied from the same Actual file. `start` is a `YYYY-MM-DD` key. */
export type RecurConfig = {
  frequency: "daily" | "weekly" | "monthly" | "yearly";
  interval?: number;
  patterns?: RecurPattern[];
  skipWeekend?: boolean;
  start: string;
  endMode?: "never" | "after_n_occurrences" | "on_date";
  endOccurrences?: number;
  endDate?: string;
  weekendSolveMode?: "before" | "after";
};

const WEEKDAY_INDEX: Record<Exclude<RecurPattern["type"], "day">, number> = {
  SU: 0,
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
};

/** rschedule will walk forever on an unbounded rule; this is a generation cap, not a semantic. */
const SAFETY = 10_000;

function intervalOf(config: RecurConfig): number {
  const n = config.interval ?? 1;
  return n < 1 ? 1 : Math.floor(n);
}

function parts(key: string): { y: number; m: number; d: number } {
  return {
    y: Number(key.slice(0, 4)),
    m: Number(key.slice(5, 7)),
    d: Number(key.slice(8, 10)),
  };
}

function keyOf(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function monthIndex(y: number, m: number): number {
  return y * 12 + (m - 1);
}

function fromMonthIndex(index: number): { y: number; m: number } {
  return { y: Math.floor(index / 12), m: (index % 12) + 1 };
}

/**
 * Day `d` of `(y, m)`, or `null` if that month does not contain it.
 *
 * **Skip, not clamp.** rschedule / RFC 5545 drop recurrence instances whose date does not
 * exist (February 31, June 31). Actual's discover path even refuses monthly day > 28 so it
 * will not silently skip months (`find-schedules.ts`). `shiftDateKeyMonths` in
 * `recurringBills.ts` clamps instead, which is the right answer for a *bill* due on the 31st
 * and the wrong one for a schedule whose conditions named day 31. Last-day-of-month is the
 * `{type:'day', value:-1}` pattern.
 */
function dateIfExists(y: number, m: number, d: number): string | null {
  if (d < 1 || d > daysInMonth(y, m)) return null;
  return keyOf(y, m, d);
}

/**
 * Move a weekend occurrence onto the neighbouring Friday (`before`) or Monday (`after`).
 *
 * Actual applies this *after* generating the rrule date (`getDateWithSkippedWeekend`), so
 * `after_n_occurrences` and `endDate` count the pre-solve date.
 */
export function applySkipWeekend(
  key: string,
  mode: RecurConfig["weekendSolveMode"] = "after",
): string {
  const weekday = weekdayOfDateKey(key);
  if (weekday !== 0 && weekday !== 6) return key;
  if (mode === "before") {
    return shiftDateKey(key, weekday === 6 ? -1 : -2);
  }
  return shiftDateKey(key, weekday === 6 ? 2 : 1);
}

function solve(key: string, config: RecurConfig): string {
  if (!config.skipWeekend) return key;
  return applySkipWeekend(key, config.weekendSolveMode ?? "after");
}

/**
 * nth weekday of a month. `n > 0` counts from the start, `n < 0` from the end.
 * Returns null when that nth does not exist (e.g. 5th Thursday in a month with four).
 */
function nthWeekday(y: number, m: number, weekday: number, n: number): string | null {
  const dim = daysInMonth(y, m);
  if (n > 0) {
    const firstWeekday = weekdayOfDateKey(keyOf(y, m, 1));
    const first = ((weekday - firstWeekday + 7) % 7) + 1;
    const day = first + (n - 1) * 7;
    return dateIfExists(y, m, day);
  }
  if (n < 0) {
    const lastWeekday = weekdayOfDateKey(keyOf(y, m, dim));
    const last = dim - ((lastWeekday - weekday + 7) % 7);
    const day = last + (n + 1) * 7;
    return dateIfExists(y, m, day);
  }
  return null;
}

function monthlyHits(y: number, m: number, config: RecurConfig): string[] {
  const patterns = config.patterns ?? [];
  const days = patterns.filter((p) => p.type === "day");
  const weekdays = patterns.filter(
    (p): p is RecurPattern & { type: Exclude<RecurPattern["type"], "day"> } =>
      p.type !== "day",
  );
  const hits: string[] = [];

  if (days.length === 0 && weekdays.length === 0) {
    const startDay = parts(config.start).d;
    const hit = dateIfExists(y, m, startDay);
    if (hit) hits.push(hit);
    return hits;
  }

  for (const pattern of days) {
    const dim = daysInMonth(y, m);
    const day = pattern.value < 0 ? dim + pattern.value + 1 : pattern.value;
    const hit = dateIfExists(y, m, day);
    if (hit) hits.push(hit);
  }
  for (const pattern of weekdays) {
    const weekday = WEEKDAY_INDEX[pattern.type];
    const hit = nthWeekday(y, m, weekday, pattern.value);
    if (hit) hits.push(hit);
  }
  return hits;
}

function stillCounting(rawCount: number, config: RecurConfig): boolean {
  if (config.endMode !== "after_n_occurrences") return true;
  const n = config.endOccurrences ?? 0;
  return rawCount < n;
}

function beforeEnd(raw: string, config: RecurConfig): boolean {
  if (config.endMode !== "on_date" || !config.endDate) return true;
  return raw <= config.endDate;
}

/**
 * Raw (pre-weekend-solve) occurrence keys, in order, starting at `config.start`.
 *
 * Interval is counted from `start`, never from the read date — a bimonthly schedule that
 * began in an odd month stays on odd months when asked in an even one.
 */
function* iterateRaw(config: RecurConfig): Generator<string> {
  const interval = intervalOf(config);
  const start = config.start;
  let rawCount = 0;

  if (config.frequency === "daily") {
    let key = start;
    while (
      rawCount < SAFETY &&
      stillCounting(rawCount, config) &&
      beforeEnd(key, config)
    ) {
      yield key;
      rawCount += 1;
      key = shiftDateKey(key, interval);
    }
    return;
  }

  if (config.frequency === "weekly") {
    let key = start;
    const step = interval * 7;
    while (
      rawCount < SAFETY &&
      stillCounting(rawCount, config) &&
      beforeEnd(key, config)
    ) {
      yield key;
      rawCount += 1;
      key = shiftDateKey(key, step);
    }
    return;
  }

  if (config.frequency === "yearly") {
    const { y: startY, m, d } = parts(start);
    let i = 0;
    while (rawCount < SAFETY && stillCounting(rawCount, config)) {
      const y = startY + i * interval;
      i += 1;
      const hit = dateIfExists(y, m, d);
      if (!hit) continue;
      if (!beforeEnd(hit, config)) return;
      if (hit < start) continue;
      yield hit;
      rawCount += 1;
    }
    return;
  }

  const startParts = parts(start);
  const startIdx = monthIndex(startParts.y, startParts.m);
  let step = 0;
  while (rawCount < SAFETY && stillCounting(rawCount, config)) {
    const idx = startIdx + step * interval;
    step += 1;
    const { y, m } = fromMonthIndex(idx);
    const hits = monthlyHits(y, m, config)
      .filter((key) => key >= start)
      .sort();
    for (const hit of hits) {
      if (rawCount >= SAFETY || !stillCounting(rawCount, config)) return;
      if (!beforeEnd(hit, config)) return;
      yield hit;
      rawCount += 1;
    }
  }
}

export type OccurrencesOptions = {
  /** Last `take` of the whole series, matching Actual's exhausted-schedule reverse take. */
  reverse?: boolean;
};

/**
 * The next `take` occurrence keys on or after `fromKey`, after weekend-solving.
 *
 * A bounded series with nothing left at `fromKey` returns its **last** occurrence rather
 * than empty — Actual's `getNextDate` falls back to `occurrences({ reverse: true, take: 1 })`
 * (`shared/schedules.ts`). Unbounded series never take that path.
 */
export function occurrences(
  config: RecurConfig,
  fromKey: string,
  take: number,
  options: OccurrencesOptions = {},
): string[] {
  if (take < 1) return [];
  const reverse = options.reverse === true;
  const solved: string[] = [];
  const seen = new Set<string>();

  for (const raw of iterateRaw(config)) {
    const key = solve(raw, config);
    if (seen.has(key)) continue;
    seen.add(key);
    solved.push(key);
    if (
      !reverse &&
      config.endMode !== "after_n_occurrences" &&
      config.endMode !== "on_date"
    ) {
      const from = solved.filter((entry) => entry >= fromKey);
      if (from.length >= take) return from.slice(0, take);
    }
    if (solved.length >= SAFETY) break;
  }

  if (reverse) return solved.slice().reverse().slice(0, take);

  const from = solved.filter((entry) => entry >= fromKey);
  if (from.length === 0) {
    return solved.length > 0 ? [solved[solved.length - 1]] : [];
  }
  return from.slice(0, take);
}
