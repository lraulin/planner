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
import { daysBetweenKeys, shiftDateKey } from "@/lib/schedule/geometry";

/** A declared bill, as the analytics and UI layers need it. Mirrors the table's columns. */
export type DeclaredBill = {
  /**
   * The user's name for it, and the key every reporting path groups its charges under.
   *
   * Was `merchant` until the commitments spec split identity from matching: the bank strings
   * this covers now live in `matchers` (`commitments.ts`), so one declaration can span Pizza
   * Hut and Domino's, and renaming it cannot orphan a charge.
   */
  name: string;
  /** Stable identities claimed by this declaration. Empty means no charge is matched. */
  payeeIds?: readonly string[];
  /**
   * Bank merchant strings this bill covers. Absent or empty means the name is the only
   * matcher — the single-merchant case every pre-split declaration had.
   */
  matchers?: readonly string[];
  /**
   * Live, cancelled, or never a commitment. Absent means `active`, so existing fixtures
   * and the narrower analytics callers keep working.
   */
  status?: "active" | "paused" | "cancelled" | "ignored";
  /** The period `expectedCents` covers, in months. Ignored when `cadenceDays` is set. */
  cadenceMonths: number;
  /**
   * The period in days, for a vendor counting days rather than months. Wins over
   * `cadenceMonths`. Absent or null is the ordinary calendar-anchored case, which is why it
   * is optional: every caller that predates day cadences means "months" by saying nothing.
   */
  cadenceDays?: number | null;
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
  /** Day of the period the charge is expected, 1–31, or null to walk from the last charge. */
  dueDay: number | null;
};

/**
 * How often a charge arrives: whole calendar months, or a fixed number of days.
 *
 * **Months are the default and the common case.** "Semi-annual" means March and September,
 * not every 182.5 days, and a day-count cadence would drift a fortnight per decade and start
 * landing bills in the wrong month.
 *
 * **Days exist because some vendors genuinely count days.** Vetsource ships a four-week
 * supply of dog medication and charges when it ships: gaps of 30, 28, 28, 31, 30, 28, 28,
 * 28, 28, 29 with a day of the month walking backward from the 30th to the 14th. Rounded to
 * "monthly" it is priced at twelve cycles a year instead of 13.04, and its predicted date
 * slips further every cycle. See `detectCadence` for how the two are told apart.
 *
 * A value rather than a bare number so the unit travels with the count. The alternative —
 * `cadenceDays ?? cadenceMonths` at each of the fifteen call sites — is one business rule
 * written fifteen times, and the fifteenth would be the one that got it wrong.
 */
export type Cadence = { unit: "month"; n: number } | { unit: "day"; n: number };

/** The cadence a stored bill is on. Days win over months; absent days mean months. */
export function cadenceOf(bill: {
  cadenceMonths: number;
  cadenceDays?: number | null;
}): Cadence {
  return bill.cadenceDays != null && bill.cadenceDays > 0
    ? { unit: "day", n: bill.cadenceDays }
    : { unit: "month", n: bill.cadenceMonths };
}

/** The columns a `Cadence` writes back to. */
export function cadenceColumns(cadence: Cadence): {
  cadenceMonths: number;
  cadenceDays: number | null;
} {
  return cadence.unit === "day"
    ? // `cadenceMonths` is `not null` and still has to hold something. The nearest month is
      // the honest filler: anything reading the column without knowing about days lands
      // close rather than on 1.
      {
        cadenceMonths: Math.max(1, Math.round(cadence.n / DAYS_PER_MONTH)),
        cadenceDays: cadence.n,
      }
    : { cadenceMonths: cadence.n, cadenceDays: null };
}

/**
 * The cadences offered in the UI.
 *
 * A closed list because these are the cadences bills actually use, and an open number field
 * would invite "every 5 months" — a value the label below could only render as itself. The
 * day entries are the ones that turn up in autoship and payroll-style billing; anything else
 * goes through the custom day field, which is why the column is a `smallint` with a 2–200
 * CHECK rather than an enum.
 */
export const CADENCE_CHOICES: readonly Cadence[] = [
  { unit: "month", n: 1 },
  { unit: "month", n: 2 },
  { unit: "month", n: 3 },
  { unit: "month", n: 6 },
  { unit: "month", n: 12 },
  { unit: "day", n: 7 },
  { unit: "day", n: 14 },
  { unit: "day", n: 28 },
];

/**
 * A `Cadence` as a single string, for a `<select>` value or a URL.
 *
 * `m6` / `d28`. Parsing is total — `cadenceFromKey` returns null on anything it does not
 * recognise, so a stale bookmark cannot produce a cadence of `NaN` months.
 */
export function cadenceKey(cadence: Cadence): string {
  return `${cadence.unit === "day" ? "d" : "m"}${cadence.n}`;
}

export function cadenceFromKey(key: string): Cadence | null {
  const match = /^([md])(\d{1,3})$/.exec(key);
  if (match === null) return null;
  const n = Number(match[2]);
  if (n < 1) return null;
  return match[1] === "d" ? { unit: "day", n } : { unit: "month", n };
}

/** Average days in a month over the Gregorian cycle. Used only to match observed gaps. */
const DAYS_PER_MONTH = 365.2425 / 12;
/** The Gregorian year, so a day cadence costs a year of leap days correctly. */
const DAYS_PER_YEAR = 365.2425;

/**
 * How far an observed gap may sit from a cadence and still be called that cadence.
 *
 * Proportional rather than a fixed number of days, because the tolerance a monthly bill needs
 * (a few days of weekend drift) would let a 3-month gap pass for monthly, and the tolerance a
 * yearly bill needs would swallow every cadence below it.
 */
const CADENCE_TOLERANCE = 0.12;

/** Roughly how often, in words. "Every 182 days" is a fact; "Every 6 months" is the answer. */
export function cadenceLabel(cadence: Cadence): string {
  if (cadence.unit === "day") {
    if (cadence.n === 7) return "Weekly";
    if (cadence.n === 14) return "Every 2 weeks";
    // Weeks read better than days wherever they are exact, and a four-week autoship is the
    // case this whole branch exists for.
    if (cadence.n % 7 === 0) return `Every ${cadence.n / 7} weeks`;
    return `Every ${cadence.n} days`;
  }
  const months = cadence.n;
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

/**
 * Roughly how many days one cycle lasts — the common unit a mixed list can be ranked and
 * compared in. Approximate for months by construction; exact for days.
 */
export function cadenceDaysApprox(cadence: Cadence): number {
  return cadence.unit === "day" ? cadence.n : cadence.n * DAYS_PER_MONTH;
}

/** Shift a key by one whole cadence, in whichever unit it is counted. */
export function shiftByCadence(key: string, cadence: Cadence): string {
  return cadence.unit === "day"
    ? shiftDateKey(key, cadence.n)
    : shiftDateKeyMonths(key, cadence.n);
}

/** When the next one lands, given the last one that did. */
export function nextDueDate(lastChargeOn: string, cadence: Cadence): string {
  return shiftByCadence(lastChargeOn, cadence);
}

/** One cadence back — the charge a declared future date is the successor to. */
export function previousDueDate(dueOn: string, cadence: Cadence): string {
  return cadence.unit === "day"
    ? shiftDateKey(dueOn, -cadence.n)
    : shiftDateKeyMonths(dueOn, -cadence.n);
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
  cadence: Cadence,
  todayKey: string,
): string {
  let due = nextDueDate(lastChargeOn, cadence);
  // Two years of cadences is far past any real gap; beyond that the anchor is wrong, and
  // walking further would only produce a confident answer built on a bad one.
  const span = cadence.unit === "day" ? 730 : 24;
  const limit = Math.ceil(span / Math.max(1, cadence.n)) + 1;
  for (let step = 0; step < limit && due < todayKey; step++) {
    due = nextDueDate(due, cadence);
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
export function spanDays(chargeDateKey: string, cadence: Cadence): number {
  return daysBetweenKeys(chargeDateKey, nextDueDate(chargeDateKey, cadence));
}

/**
 * What a year of this costs. The figure that makes a bill a decision rather than a blip.
 *
 * The monthly set-aside is this over twelve, and is deliberately not a second function here:
 * a detected merchant's annual figure comes from its observed cadence in days rather than
 * from this, and one derivation shared by both is what keeps the recurring table's column
 * meaning the same thing in every row.
 */
export function annualCents(chargeCents: number, cadence: Cadence): number {
  return cadence.unit === "day"
    ? Math.round((chargeCents * DAYS_PER_YEAR) / cadence.n)
    : Math.round((chargeCents * 12) / cadence.n);
}

/**
 * The month cadence an observed gap looks like, or null if it looks like none of them.
 *
 * Nearest match wins, and only within tolerance: 200 days is a semi-annual bill that slipped
 * a fortnight, while 240 days is 7.9 months and belongs to no cadence anyone bills on.
 * Returning null there is the point — a proposal nobody can make sense of is worse than no
 * proposal, because it invites a confirming click.
 */
export function cadenceMonthsFromGapDays(gapDays: number): number | null {
  let best: number | null = null;
  let bestDistance = Infinity;

  for (const choice of CADENCE_CHOICES) {
    if (choice.unit !== "month") continue;
    const expected = choice.n * DAYS_PER_MONTH;
    const distance = Math.abs(gapDays - expected);
    if (distance <= expected * CADENCE_TOLERANCE && distance < bestDistance) {
      best = choice.n;
      bestDistance = distance;
    }
  }

  return best;
}

/** `cadenceMonthsFromGapDays` as a `Cadence`. */
export function cadenceFromGapDays(gapDays: number): Cadence | null {
  const months = cadenceMonthsFromGapDays(gapDays);
  return months === null ? null : { unit: "month", n: months };
}

/** Charges needed before a *day* cadence can be claimed. Three gaps, not one coincidence. */
const MIN_CHARGES_FOR_DAY_CADENCE = 4;
/** How far the day of the month may wander before the charge is not calendar-anchored. */
const DAY_OF_MONTH_TOLERANCE = 3;
/**
 * How far individual gaps may sit from their median before "every N days" is a fiction.
 *
 * Three, from the data: Vetsource's gaps are 30, 28, 28, 31, 30, 28, 28, 28, 28, 29 around a
 * median of 28, so a tolerance of two would reject the one series this branch exists for.
 * Processing delays and weekends are worth a few days; a series that wanders further than
 * that is not being counted in days by anyone.
 */
const DAY_GAP_TOLERANCE = 3;
/** Past this, a day count is a worse description than the month it rounds to. */
const MAX_DETECTED_CADENCE_DAYS = 60;

/**
 * The cadence a series of charge dates is on — months or days.
 *
 * **The discriminator is the day of the month, and it costs nothing.** A monthly bill holds
 * it; a day cycle walks it. The gaps alone cannot tell the two apart, because a monthly bill
 * and a 28-day autoship both produce gaps of 28 to 31 — Vetsource's are 30, 28, 28, 31, 30,
 * 28, 28, 28, 28, 29, and so are plenty of monthly bills'. What separates them is that
 * Vetsource's charges land on the 30th, 29th, 27th, 24th, 24th, 26th, 23rd, 21st, 18th, 16th
 * and 14th while rent lands on the 1st every time.
 *
 * Months are the fallback in every uncertain case: a day count is the stronger claim, so it
 * has to be earned by four charges, tight gaps, and a day of the month that actually moved.
 */
export function detectCadence(chargeDates: readonly string[]): Cadence | null {
  const ordered = [...chargeDates].sort();
  if (ordered.length < 2) return null;

  const gaps: number[] = [];
  for (let index = 1; index < ordered.length; index++) {
    gaps.push(daysBetweenKeys(ordered[index - 1], ordered[index]));
  }
  const typicalGap = medianOf(gaps);
  if (typicalGap <= 0) return null;

  if (
    ordered.length >= MIN_CHARGES_FOR_DAY_CADENCE &&
    typicalGap <= MAX_DETECTED_CADENCE_DAYS &&
    !calendarAnchored(ordered) &&
    gaps.every((gap) => Math.abs(gap - typicalGap) <= DAY_GAP_TOLERANCE)
  ) {
    return { unit: "day", n: Math.round(typicalGap) };
  }

  return cadenceFromGapDays(typicalGap);
}

/**
 * Whether these charges keep to a day of the month.
 *
 * Month-end is the case that would otherwise read as drift: a bill due on the 31st posts on
 * the 28th in February, so distance from the end of the month counts as anchored too.
 */
function calendarAnchored(ordered: readonly string[]): boolean {
  const days = ordered.map((key) => Number(key.slice(8, 10)));
  const fromEnd = ordered.map(
    (key) =>
      daysInMonth(Number(key.slice(0, 4)), Number(key.slice(5, 7))) -
      Number(key.slice(8, 10)),
  );
  return (
    spread(days) <= DAY_OF_MONTH_TOLERANCE || spread(fromEnd) <= DAY_OF_MONTH_TOLERANCE
  );
}

function spread(values: readonly number[]): number {
  return Math.max(...values) - Math.min(...values);
}

function medianOf(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}
