/**
 * Achieve's recurrence patterns (manual §3.9), as a pure function from a rule and the
 * occurrence you just finished to the one that comes next.
 *
 * Every frequency offers two shapes, which is the whole point of the feature:
 *
 * - **scheduled** — a fixed calendar series. The next date is measured from *this
 *   occurrence's own dates*. Finish next Friday's report on Wednesday and you are free
 *   until the Friday after; miss one and you still owe it, because completing it late only
 *   steps you on by one period.
 * - **regenerate** — measured from *the completion*. Handled by `nextDue` in `./nextDue`,
 *   not here: Achieve's Regenerate radio excludes the pattern radios, so a regenerating
 *   task is always a plain interval step and has no weekday or day-of-month to honour.
 *
 * Pure — no I/O and no `new Date()`. Everything works in **local calendar days at
 * midnight**, matching `DateField`, which writes local midnight and is the only way these
 * columns are edited by hand. Times of day are dropped deliberately: these are date
 * fields, and carrying an 18:32 from whenever the task happened to be ticked makes every
 * later comparison depend on it.
 */

import type {
  RecurrenceFrequency,
  RecurrenceMode,
  RecurrencePattern,
} from "@/db/schema";
import { addDays, addMonths, addYears, daysInMonth, startOfDay } from "@/lib/dateMath";

export type RecurrenceRule = {
  frequency: RecurrenceFrequency;
  interval: number;
  pattern: RecurrencePattern;
  /** Weekly `by_weekday`: 0 = Sunday. */
  byWeekday: number[] | null;
  /** `by_month_day`: 1–31. */
  monthDay: number | null;
  /** `by_ordinal`: 1–4, or -1 for last. */
  ordinal: number | null;
  /** `by_ordinal`: 0 = Sunday. */
  weekday: number | null;
  /** Yearly patterns: 1–12. */
  month: number | null;
};

/**
 * Guard on every stepping loop. A rule that can never be satisfied must fail fast rather
 * than spin a request; 500 steps is centuries at any frequency this app offers.
 */
const MAX_STEPS = 500;

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const ORDINAL_NAMES: Record<number, string> = {
  1: "first",
  2: "second",
  3: "third",
  4: "fourth",
  [-1]: "last",
};

/** Intervals below 1 would mean "due again immediately", which is never what anyone meant. */
function steps(interval: number): number {
  return Math.max(1, Math.floor(interval));
}

/**
 * The date `ordinal` occurrences of `weekday` into `month`, or the last one when
 * `ordinal` is -1. `month` is 1–12.
 *
 * The last is counted from the **end** of the month, never as "the fourth or fifth" —
 * those two only differ in the months with five of that weekday, which is exactly where
 * getting it wrong would show.
 */
export function nthWeekdayOfMonth(
  year: number,
  month: number,
  ordinal: number,
  weekday: number,
): Date {
  if (ordinal === -1) {
    const last = new Date(year, month - 1, daysInMonth(year, month));
    return addDays(last, -((last.getDay() - weekday + 7) % 7));
  }

  const first = new Date(year, month - 1, 1);
  const offset = (weekday - first.getDay() + 7) % 7;
  return addDays(first, offset + (ordinal - 1) * 7);
}

/** The first day on or after `date` whose weekday is in `weekdays`. Null if the set is empty. */
export function nextWeekdayOnOrAfter(date: Date, weekdays: number[]): Date | null {
  if (weekdays.length === 0) return null;
  const set = new Set(weekdays);
  let d = startOfDay(date);
  for (let i = 0; i < 7; i++) {
    if (set.has(d.getDay())) return d;
    d = addDays(d, 1);
  }
  return null;
}

/**
 * The first occurrence **strictly after the calendar day** of `after`, or null when the
 * rule does not repeat or cannot be satisfied.
 *
 * Strictly-after is by calendar day and not by instant, which is the boundary most likely
 * to be got wrong: a daily routine ticked at 09:00 must not be back at 09:01, and
 * `isDeferred` already judges these dates a day at a time.
 *
 * `after` is normally the occurrence just completed — its own anchor date, not the moment
 * it was ticked. That is what makes a fixed series fixed.
 */
export function nextOccurrence(rule: RecurrenceRule, after: Date): Date | null {
  const from = startOfDay(after);
  const n = steps(rule.interval);

  switch (rule.frequency) {
    case "none":
      return null;

    case "daily":
      if (rule.pattern === "weekday") return nextInSet(from, [1, 2, 3, 4, 5]);
      if (rule.pattern === "weekend") return nextInSet(from, [0, 6]);
      return addDays(from, n);

    case "weekly":
      if (rule.pattern === "by_weekday") return nextWeekly(from, n, rule.byWeekday);
      return addDays(from, n * 7);

    case "monthly":
      if (rule.pattern === "by_month_day") return nextMonthly(from, n, rule.monthDay);
      if (rule.pattern === "by_ordinal") {
        return nextMonthlyOrdinal(from, n, rule.ordinal, rule.weekday);
      }
      return addMonths(from, n);

    case "yearly":
      if (rule.pattern === "by_month_day") {
        return nextYearly(from, n, rule.month, rule.monthDay);
      }
      if (rule.pattern === "by_ordinal") {
        return nextYearlyOrdinal(from, n, rule.month, rule.ordinal, rule.weekday);
      }
      return addYears(from, n);
  }
}

/** Every weekday / every weekend: the next matching day. The interval does not apply. */
function nextInSet(from: Date, weekdays: number[]): Date | null {
  return nextWeekdayOnOrAfter(addDays(from, 1), weekdays);
}

/**
 * Every `n` weeks on the ticked days.
 *
 * The week grid is anchored on the week containing `from`, which works because `from` is
 * itself an occurrence: take the next ticked day later in that same week, and only when
 * the week is used up jump `n` weeks and take its first ticked day. Anchoring anywhere
 * else lets "every 2 weeks on Mon and Thu" drift into consecutive weeks.
 */
function nextWeekly(from: Date, n: number, byWeekday: number[] | null): Date | null {
  const weekdays = [...new Set(byWeekday ?? [])].sort((a, b) => a - b);
  if (weekdays.length === 0) return null;

  const laterThisWeek = weekdays.find((wd) => wd > from.getDay());
  if (laterThisWeek !== undefined) return addDays(from, laterThisWeek - from.getDay());

  // Sunday of the week `n` intervals on, then its first ticked day.
  const nextWeekStart = addDays(from, -from.getDay() + n * 7);
  return addDays(nextWeekStart, weekdays[0]);
}

/** Day `monthDay` of every `n` months, clamped to the last day of a short month. */
function nextMonthly(from: Date, n: number, monthDay: number | null): Date | null {
  if (monthDay == null) return null;

  return stepUntilAfter(from, (i) => {
    const base = addMonths(new Date(from.getFullYear(), from.getMonth(), 1), n * i);
    const year = base.getFullYear();
    const month = base.getMonth() + 1;
    return new Date(year, month - 1, Math.min(monthDay, daysInMonth(year, month)));
  });
}

/** The {first…last} {weekday} of every `n` months. */
function nextMonthlyOrdinal(
  from: Date,
  n: number,
  ordinal: number | null,
  weekday: number | null,
): Date | null {
  if (ordinal == null || weekday == null) return null;

  return stepUntilAfter(from, (i) => {
    const base = addMonths(new Date(from.getFullYear(), from.getMonth(), 1), n * i);
    return nthWeekdayOfMonth(base.getFullYear(), base.getMonth() + 1, ordinal, weekday);
  });
}

/** {month} {day}, every `n` years. Feb 29 clamps to Feb 28 in a common year. */
function nextYearly(
  from: Date,
  n: number,
  month: number | null,
  monthDay: number | null,
): Date | null {
  if (month == null || monthDay == null) return null;

  return stepUntilAfter(from, (i) => {
    const year = from.getFullYear() + n * i;
    return new Date(year, month - 1, Math.min(monthDay, daysInMonth(year, month)));
  });
}

/** The {first…last} {weekday} of {month}, every `n` years. */
function nextYearlyOrdinal(
  from: Date,
  n: number,
  month: number | null,
  ordinal: number | null,
  weekday: number | null,
): Date | null {
  if (month == null || ordinal == null || weekday == null) return null;

  return stepUntilAfter(from, (i) =>
    nthWeekdayOfMonth(from.getFullYear() + n * i, month, ordinal, weekday),
  );
}

/**
 * Walk `candidate(0), candidate(1), …` until one lands after `from`.
 *
 * Starting at 0 rather than 1 is what lets a rule that was just switched on find its first
 * occurrence inside the current month or year. Once the series is running, `from` is
 * already on the grid and candidate 0 is `from` itself, so it steps on the first try.
 */
function stepUntilAfter(from: Date, candidate: (i: number) => Date): Date | null {
  for (let i = 0; i < MAX_STEPS; i++) {
    const date = candidate(i);
    if (date > from) return date;
  }
  return null;
}

/** The rule in words, for the drawer: "Every 2 weeks on Mon, Wed". */
export function describeRule(rule: RecurrenceRule, mode: RecurrenceMode): string {
  if (rule.frequency === "none") return "Does not repeat";

  const n = steps(rule.interval);
  const unit = { daily: "day", weekly: "week", monthly: "month", yearly: "year" }[
    rule.frequency
  ];
  const every = n === 1 ? `Every ${unit}` : `Every ${n} ${unit}s`;

  if (mode === "regenerate") {
    return `${n} ${n === 1 ? unit : `${unit}s`} after each completion`;
  }

  if (rule.pattern === "weekday") return "Every weekday";
  if (rule.pattern === "weekend") return "Every weekend day";

  if (rule.pattern === "by_weekday") {
    const days = [...new Set(rule.byWeekday ?? [])]
      .sort((a, b) => a - b)
      .map((d) => WEEKDAY_NAMES[d]);
    return days.length > 0 ? `${every} on ${days.join(", ")}` : every;
  }

  if (rule.pattern === "by_month_day" && rule.monthDay != null) {
    if (rule.frequency === "yearly" && rule.month != null) {
      return `${every} on ${MONTH_NAMES[rule.month - 1]} ${rule.monthDay}`;
    }
    return `${every} on day ${rule.monthDay}`;
  }

  if (rule.pattern === "by_ordinal" && rule.ordinal != null && rule.weekday != null) {
    const which = `the ${ORDINAL_NAMES[rule.ordinal] ?? rule.ordinal} ${
      WEEKDAY_NAMES[rule.weekday]
    }`;
    if (rule.frequency === "yearly" && rule.month != null) {
      return `${every} on ${which} of ${MONTH_NAMES[rule.month - 1]}`;
    }
    return `${every} on ${which}`;
  }

  return every;
}
