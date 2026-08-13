/**
 * Turning detected paydays into a calendar the dashboard can group on.
 *
 * A calendar month with three biweekly paychecks looks rich and the next looks poor. The
 * money did not change — the bucket did. Grouping on one-paycheck windows is what makes
 * those two months comparable, which is the whole reason this feature exists.
 *
 * Period starts are the payday dates themselves. Gaps that are still a holiday-stretched
 * biweekly stay one period; a job-change hole (Endava's last check to TrustedQA's first
 * is 77 days) is filled with empty 14-day windows so that hole does not become one giant
 * bucket of spending against a single leftover paycheck. The range is extended the same
 * way so a dashboard window that starts before the first job or ends after the last one
 * still has a place to put every transaction.
 *
 * Date math stays on `YYYY-MM-DD` keys. These are calendar labels, not instants.
 */

import { daysBetweenKeys, shiftDateKey } from "@/lib/schedule/geometry";
import { BIWEEKLY_DAYS, type Payday } from "./income";

/**
 * How far past 14 days a gap may stretch and still be "the next paycheck" rather than a
 * hole. Endava posted 18 and 19 days apart around holidays; 20 keeps those as one period
 * without swallowing the 77-day job change.
 */
const NEXT_PAYCHECK_SLACK_DAYS = 6;

export type PayPeriod = {
  /** Inclusive `YYYY-MM-DD`. */
  startKey: string;
  /** Inclusive `YYYY-MM-DD`. */
  endKey: string;
  /** Empty when this window was inferred across a gap or past the last real payday. */
  paydays: Payday[];
};

export type PayPeriodRange = {
  startKey: string;
  endKey: string;
};

function uniqueDateKeys(paydays: readonly Payday[]): string[] {
  const keys: string[] = [];
  for (const payday of paydays) {
    if (keys[keys.length - 1] !== payday.dateKey) keys.push(payday.dateKey);
  }
  return keys;
}

function byDate(paydays: readonly Payday[]): Map<string, Payday[]> {
  const grouped = new Map<string, Payday[]>();
  for (const payday of paydays) {
    const bucket = grouped.get(payday.dateKey);
    if (bucket) bucket.push(payday);
    else grouped.set(payday.dateKey, [payday]);
  }
  return grouped;
}

function stillNextPaycheck(fromKey: string, toKey: string): boolean {
  return daysBetweenKeys(fromKey, toKey) <= BIWEEKLY_DAYS + NEXT_PAYCHECK_SLACK_DAYS;
}

/**
 * Period starts covering `range`: inferred days before the first payday, each real payday,
 * empty 14-day steps across a job-change hole, then inferred days after the last payday.
 */
function periodStarts(dates: readonly string[], range: PayPeriodRange): string[] {
  const first = dates[0];
  const last = dates[dates.length - 1];
  const starts: string[] = [];

  let cursor = first;
  while (cursor > range.startKey) cursor = shiftDateKey(cursor, -BIWEEKLY_DAYS);
  while (cursor < first) {
    starts.push(cursor);
    cursor = shiftDateKey(cursor, BIWEEKLY_DAYS);
  }

  for (let i = 0; i < dates.length; i++) {
    starts.push(dates[i]);
    const next = dates[i + 1];
    if (next === undefined || stillNextPaycheck(dates[i], next)) continue;
    let fill = shiftDateKey(dates[i], BIWEEKLY_DAYS);
    while (!stillNextPaycheck(fill, next)) {
      starts.push(fill);
      fill = shiftDateKey(fill, BIWEEKLY_DAYS);
    }
  }

  let after = shiftDateKey(last, BIWEEKLY_DAYS);
  while (after <= range.endKey) {
    starts.push(after);
    after = shiftDateKey(after, BIWEEKLY_DAYS);
  }

  return starts;
}

function clip(
  startKey: string,
  endKey: string,
  range: PayPeriodRange,
): PayPeriod | null {
  const clippedStart = startKey < range.startKey ? range.startKey : startKey;
  const clippedEnd = endKey > range.endKey ? range.endKey : endKey;
  if (clippedStart > clippedEnd) return null;
  return { startKey: clippedStart, endKey: clippedEnd, paydays: [] };
}

/**
 * Tile `range` with one-paycheck windows derived from `paydays`.
 *
 * Returns an empty list when there are no paydays — there is no pay-period axis without
 * a paycheck to hang it on. Periods are contiguous, inclusive on both ends, and do not
 * overlap.
 */
export function buildPayPeriods(
  paydays: readonly Payday[],
  range: PayPeriodRange,
): PayPeriod[] {
  if (paydays.length === 0 || range.startKey > range.endKey) return [];

  const ordered = [...paydays].sort(
    (left, right) =>
      left.dateKey.localeCompare(right.dateKey) ||
      left.employer.localeCompare(right.employer),
  );
  const dates = uniqueDateKeys(ordered);
  const paydaysByDate = byDate(ordered);
  const starts = periodStarts(dates, range);
  const periods: PayPeriod[] = [];

  for (let i = 0; i < starts.length; i++) {
    const start = starts[i];
    const next = starts[i + 1];
    const rawEnd = next
      ? shiftDateKey(next, -1)
      : shiftDateKey(start, BIWEEKLY_DAYS - 1);
    const period = clip(start, rawEnd, range);
    if (!period) continue;
    period.paydays = paydaysByDate.get(start) ?? [];
    periods.push(period);
  }

  return periods;
}

/** The period that contains `dateKey`, or null when the calendar does not cover it. */
export function periodContaining(
  dateKey: string,
  periods: readonly PayPeriod[],
): PayPeriod | null {
  for (const period of periods) {
    if (period.startKey <= dateKey && dateKey <= period.endKey) return period;
  }
  return null;
}
