/**
 * Cadence arithmetic for bills the user has **declared** recurring.
 *
 * Detection cannot reach the long cadences. `recurringMerchants` needs six charges at a gap
 * under 100 days before it will call something a subscription — right for a claim made
 * without being asked, and permanently out of reach for a semi-annual propane bill or an
 * annual premium. Those arrive on the one-off review list instead, where excluding them
 * understates what a year costs and leaving them means seeing them again next window. A
 * declared cadence is the third answer, and this module is the arithmetic behind it.
 *
 * **Months, not days, and never a `Date` for the calendar work.** "Semi-annual" means March
 * and September; a 182-day cadence drifts a fortnight per decade and starts landing bills in
 * the wrong month. Every function here takes and returns `YYYY-MM-DD` keys and does its month
 * arithmetic on the parts, so there is no local-midnight round trip in which the Aug 1 →
 * Jul 31 regression could happen (`agent-os/standards/development/dates.md`).
 *
 * Deliberately free of any import from `analytics.ts`, so the dependency runs one way:
 * analytics knows about cadences, cadences know nothing about analytics.
 */

import { daysInMonth } from "@/lib/dateMath";
import { daysBetweenKeys } from "@/lib/schedule/geometry";

/** A declared bill, as the analytics and UI layers need it. Mirrors the table's columns. */
export type DeclaredBill = {
  merchant: string;
  /** The period `expectedCents` covers. */
  cadenceMonths: number;
  /** Null means "use the median of the charges on file" — better once there is history. */
  expectedCents: number | null;
  /** Overrides the latest charge as the anchor for the next-due walk. */
  anchorDate: string | null;
  /**
   * Whether the dates are predictable, as distinct from the cost. False for propane: the
   * yearly figure is solid, the delivery date is a tank sensor and the weather.
   */
  scheduled: boolean;
};

/**
 * A declaration as the **table** holds it — every column, including the ones only the
 * dashboard's set-aside arithmetic reads.
 *
 * `DeclaredBill` above is deliberately the narrower shape: it is what `analytics.ts` needs to
 * cost a year and forecast a due date, and widening it would make every caller that has no
 * interest in budgeting supply two fields to satisfy the compiler. A `StoredBill` is assignable
 * wherever a `DeclaredBill` is wanted, so the read is one query either way.
 */
export type StoredBill = DeclaredBill & {
  /**
   * Hold this bill's cost back from "available to spend", a share out of each paycheck.
   *
   * Independent of `scheduled` — that one is about the date, this one is about the money, and
   * an unscheduled bill is a perfectly good set-aside.
   */
  setAside: boolean;
  /** Day of the period the charge is expected, 1–31, or null to walk from the last charge. */
  dueDay: number | null;
};

/**
 * The cadences offered in the UI, in months.
 *
 * A closed list because these are the cadences bills actually use, and an open number field
 * would invite "every 5 months" — a value the label below could only render as itself. The
 * column is a `smallint` with a 1–24 CHECK rather than an enum, so widening this list later
 * is a one-line change with no migration.
 */
export const CADENCE_CHOICES = [1, 2, 3, 6, 12] as const;

/** Average days in a month over the Gregorian cycle. Used only to match observed gaps. */
const DAYS_PER_MONTH = 365.2425 / 12;

/**
 * How far an observed gap may sit from a cadence and still be called that cadence.
 *
 * Proportional rather than a fixed number of days, because the tolerance a monthly bill needs
 * (a few days of weekend drift) would let a 3-month gap pass for monthly, and the tolerance a
 * yearly bill needs would swallow every cadence below it.
 */
const CADENCE_TOLERANCE = 0.12;

/** Roughly how often, in words. "Every 182 days" is a fact; "Every 6 months" is the answer. */
export function cadenceLabel(months: number): string {
  if (months === 1) return "Monthly";
  if (months === 2) return "Every 2 months";
  if (months === 3) return "Quarterly";
  if (months === 6) return "Every 6 months";
  if (months === 12) return "Yearly";
  if (months === 24) return "Every 2 years";
  return `Every ${months} months`;
}

/**
 * Shift a `YYYY-MM-DD` key by whole calendar months, clamping into a short target month
 * rather than overflowing past it — Aug 31 + 6 months is Feb 28 (or Feb 29), not Mar 3.
 *
 * The parts are shifted arithmetically instead of through `Date.setMonth`, which overflows
 * and has to be walked back, and which reads the day through local getters.
 */
export function shiftDateKeyMonths(key: string, months: number): string {
  const year = Number(key.slice(0, 4));
  const month = Number(key.slice(5, 7));
  const day = Number(key.slice(8, 10));

  const zeroBased = month - 1 + months;
  const targetYear = year + Math.floor(zeroBased / 12);
  const targetMonth = (((zeroBased % 12) + 12) % 12) + 1;
  const targetDay = Math.min(day, daysInMonth(targetYear, targetMonth));

  return `${String(targetYear).padStart(4, "0")}-${String(targetMonth).padStart(2, "0")}-${String(
    targetDay,
  ).padStart(2, "0")}`;
}

/** When the next one lands, given the last one that did. */
export function nextDueDate(lastChargeOn: string, cadenceMonths: number): string {
  return shiftDateKeyMonths(lastChargeOn, cadenceMonths);
}

/**
 * The next due date at or after `todayKey`, walking forward a cadence at a time.
 *
 * A bill last charged three cycles ago is not two years overdue, it is due next month, and a
 * single `+ cadence` would say the former. The walk is bounded because a stale anchor with a
 * short cadence would otherwise iterate for as long as the history is deep.
 */
export function nextDueFrom(
  lastChargeOn: string,
  cadenceMonths: number,
  todayKey: string,
): string {
  let due = nextDueDate(lastChargeOn, cadenceMonths);
  // 24 months of cadences is far past any real gap; beyond that the anchor is wrong, and
  // walking further would only produce a confident answer built on a bad one.
  const limit = Math.ceil(24 / Math.max(1, cadenceMonths)) + 1;
  for (let step = 0; step < limit && due < todayKey; step++) {
    due = nextDueDate(due, cadenceMonths);
  }
  return due;
}

/**
 * Days from a charge to the day before the next one — the span it actually covers.
 *
 * This is what `allocateAcross` needs to spread a bill over the buckets it pays for. Computed
 * from the real dates rather than from `cadenceMonths × 30.44`, so a February-anchored
 * semi-annual bill covers its own 181 days rather than a notional 183.
 */
export function spanDays(chargeDateKey: string, cadenceMonths: number): number {
  return daysBetweenKeys(chargeDateKey, nextDueDate(chargeDateKey, cadenceMonths));
}

/**
 * What a year of this costs. The figure that makes a bill a decision rather than a blip.
 *
 * The monthly set-aside is this over twelve, and is deliberately not a second function here:
 * a detected merchant's annual figure comes from its observed cadence in days rather than
 * from this, and one derivation shared by both is what keeps the recurring table's column
 * meaning the same thing in every row.
 */
export function annualCents(chargeCents: number, cadenceMonths: number): number {
  return Math.round((chargeCents * 12) / cadenceMonths);
}

/**
 * The cadence an observed gap looks like, or null if it looks like none of them.
 *
 * Nearest match wins, and only within tolerance: 200 days is a semi-annual bill that slipped
 * a fortnight, while 240 days is 7.9 months and belongs to no cadence anyone bills on.
 * Returning null there is the point — a proposal nobody can make sense of is worse than no
 * proposal, because it invites a confirming click.
 */
export function cadenceMonthsFromGapDays(gapDays: number): number | null {
  let best: number | null = null;
  let bestDistance = Infinity;

  for (const months of CADENCE_CHOICES) {
    const expected = months * DAYS_PER_MONTH;
    const distance = Math.abs(gapDays - expected);
    if (distance <= expected * CADENCE_TOLERANCE && distance < bestDistance) {
      best = months;
      bestDistance = distance;
    }
  }

  return best;
}
