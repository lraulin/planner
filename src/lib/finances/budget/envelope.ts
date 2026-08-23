/**
 * The envelope (zero-based) budget: balances, carryover, and Ready to Assign.
 *
 * **Reimplemented from Actual Budget** — `packages/loot-core/src/server/budget/envelope.ts`,
 * `base.ts` and `actions.ts` (MIT, © James Long; see `docs/actual-budget/README.md` for the
 * file-by-file map). Actual computes these as cells in a reactive spreadsheet over SQLite;
 * every cell is a pure function of the previous month, so the same arithmetic falls out as a
 * fold. The formulas are theirs and are reproduced deliberately rather than re-derived: they
 * are load-bearing, and four of the five ways to get them wrong produce numbers that look
 * entirely plausible.
 *
 * Nothing here touches the database or React. Everything is integer cents, asserted — Actual's
 * `safeNumber` throws on a non-integer and so does this, because a fraction that enters the
 * opening position silently poisons every balance derived from it.
 *
 * Spec: `agent-os/specs/2026-08-22-1948-zero-based-budget/` D1 and D7.
 */

import { daysInMonth } from "@/lib/dateMath";

/**
 * A month, keyed by its first calendar day (`2026-08-01`).
 *
 * The same representation the `month` columns store, so no conversion sits between the fold
 * and its rows. `YYYY-MM` would read better in a URL and is converted at that one edge
 * (`monthKeyFromParam`) rather than carried as a second internal format.
 */
export type MonthKey = string;

const MONTH_KEY_PATTERN = /^\d{4}-\d{2}-01$/;
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
] as const;

/**
 * Guard rail on the fold's length.
 *
 * `buildBudget` walks every month from the start to the horizon, so a corrupt start month
 * would otherwise allocate an unbounded array before anything noticed. Twelve hundred months
 * is a century, which is longer than any budget and shorter than a hang.
 */
const MAX_MONTHS = 1200;

/** Every finite money value in this module is a whole number of cents, and proves it. */
function cents(value: number, what: string): number {
  if (!Number.isInteger(value)) {
    throw new Error(`${what} must be integer cents, got ${value}`);
  }
  return value;
}

/** The calendar month a `YYYY-MM-DD` day belongs to. */
export function monthKeyOf(dateKey: string): MonthKey {
  return `${dateKey.slice(0, 7)}-01`;
}

export function isMonthKey(value: string): boolean {
  return (
    MONTH_KEY_PATTERN.test(value) &&
    Number(value.slice(5, 7)) >= 1 &&
    Number(value.slice(5, 7)) <= 12
  );
}

/**
 * `2026-08` from a URL to `2026-08-01`, or null if it is not a month.
 *
 * The one place the two spellings meet. Rejecting rather than coercing matters because a
 * bad `?month=` would otherwise fold from a month no allocation shares, and every figure on
 * the page would be a confident zero.
 */
export function monthKeyFromParam(value: string | null | undefined): MonthKey | null {
  if (!value) return null;
  const key = /^\d{4}-\d{2}$/.test(value) ? `${value}-01` : value;
  return isMonthKey(key) ? key : null;
}

/** `2026-08-01` → `2026-08`, for the URL. */
export function monthParamOf(month: MonthKey): string {
  return month.slice(0, 7);
}

/** Shift by whole months. Arithmetic on the string; no `Date`, so no timezone to get wrong. */
export function shiftMonthKey(month: MonthKey, delta: number): MonthKey {
  const year = Number(month.slice(0, 4));
  const zeroBased = Number(month.slice(5, 7)) - 1 + delta;
  const targetYear = year + Math.floor(zeroBased / 12);
  const targetMonth = (((zeroBased % 12) + 12) % 12) + 1;
  return `${String(targetYear).padStart(4, "0")}-${String(targetMonth).padStart(2, "0")}-01`;
}

export function prevMonthKey(month: MonthKey): MonthKey {
  return shiftMonthKey(month, -1);
}

export function nextMonthKey(month: MonthKey): MonthKey {
  return shiftMonthKey(month, 1);
}

/** Last calendar day of the month, for a date range that has to be inclusive. */
export function monthEndKey(month: MonthKey): string {
  const year = Number(month.slice(0, 4));
  const monthNumber = Number(month.slice(5, 7));
  return `${month.slice(0, 7)}-${String(daysInMonth(year, monthNumber)).padStart(2, "0")}`;
}

/** Inclusive, chronological. Empty when `end` precedes `start`. */
export function monthKeyRange(start: MonthKey, end: MonthKey): MonthKey[] {
  const months: MonthKey[] = [];
  let cursor = start;
  while (cursor <= end && months.length < MAX_MONTHS) {
    months.push(cursor);
    cursor = nextMonthKey(cursor);
  }
  return months;
}

/** `August` for any `YYYY-MM-…` key. String arithmetic, so it cannot drift at a negative offset. */
export function monthName(dateKey: string): string {
  return MONTH_NAMES[Number(dateKey.slice(5, 7)) - 1] ?? dateKey.slice(5, 7);
}

/** `August 2026`. */
export function monthLabel(month: MonthKey): string {
  return `${monthName(month)} ${month.slice(0, 4)}`;
}

// ─────────────────────────────── Inputs ───────────────────────────────

/**
 * What the fold needs to know about an envelope. A structural subset of the row, so the query
 * layer's own type satisfies it and this module imports nothing from the database.
 */
export type BudgetCategoryInput = {
  id: string;
  groupId: string;
  /** Income envelopes are never assigned and never hold a balance — they feed Ready to Assign. */
  isIncome: boolean;
};

export type AllocationInput = {
  month: MonthKey;
  categoryId: string;
  amountCents: number;
  carryover: boolean;
};

/** Signed sum of on-budget transactions for one envelope in one month. Negative is spending. */
export type ActivityInput = {
  month: MonthKey;
  categoryId: string;
  amountCents: number;
};

export type BufferedInput = {
  month: MonthKey;
  bufferedCents: number;
};

export type BudgetInput = {
  categories: readonly BudgetCategoryInput[];
  /** Sparse. A missing month/category pair is `{ amountCents: 0, carryover: false }`. */
  allocations: readonly AllocationInput[];
  /** Sparse, and only for months in range. Activity outside `[startMonth, endMonth]` is ignored. */
  activity: readonly ActivityInput[];
  buffered: readonly BufferedInput[];
  /** First budgeted month. Everything before it is treated as absent, not as zero-assigned. */
  startMonth: MonthKey;
  /** Horizon. Usually the current month plus a year, so next year's bills can be funded early. */
  endMonth: MonthKey;
  /**
   * On-budget position the day before `startMonth`, seeding "funds from last month".
   *
   * Signed: card balances are on-budget, so starting in the hole is both possible and honest.
   */
  openingCents: number;
};

// ─────────────────────────────── Outputs ───────────────────────────────

export type CategoryMonth = {
  categoryId: string;
  assignedCents: number;
  activityCents: number;
  balanceCents: number;
  /** The flag stored on *this* month, which is what next month's carry-in consults. */
  carryover: boolean;
};

export type BudgetTerm = {
  label: string;
  cents: number;
};

export type BudgetMonth = {
  month: MonthKey;
  /** Keyed by category id. Order lives with the categories, not with their numbers. */
  categories: Record<string, CategoryMonth>;
  fromLastMonthCents: number;
  totalIncomeCents: number;
  availableFundsCents: number;
  /** Zero or negative: overspend from last month that no carryover flag absorbed. */
  lastMonthOverspentCents: number;
  totalAssignedCents: number;
  totalActivityCents: number;
  /** Sum of every expense envelope's balance. With Ready to Assign, this is the whole pot. */
  totalBalanceCents: number;
  bufferedCents: number;
  readyToAssignCents: number;
  /**
   * The arithmetic in reading order, summing to `readyToAssignCents`.
   *
   * Returned rather than reassembled in the component, for the reason `availableToSpend` does
   * the same: a page that formats its terms twice is a page that can show a breakdown which
   * does not add up to its own headline.
   */
  terms: BudgetTerm[];
};

const ZERO_CATEGORY_MONTH = {
  assignedCents: 0,
  activityCents: 0,
  balanceCents: 0,
  carryover: false,
} as const;

function key(month: MonthKey, categoryId: string): string {
  return `${month}|${categoryId}`;
}

/**
 * Walk the months forward, deriving every balance and every Ready to Assign.
 *
 * The recurrence, which is the whole feature:
 *
 * ```
 * balance(c, m) = assigned(c, m) + activity(c, m) + carryIn(c, m)
 * carryIn(c, m) = carryover(c, m-1) ? balance(c, m-1) : max(0, balance(c, m-1))
 * ```
 *
 * A positive balance always rolls forward. A negative one rolls forward **only** when the
 * envelope's carryover flag was set on the previous month; otherwise it is charged against
 * this month's Ready to Assign through `lastMonthOverspent`. Either way it is counted once —
 * `lastMonthOverspent` skips exactly the envelopes whose negative balance the carry-in kept,
 * and forgetting that skip is the classic double-count.
 *
 * The month before `startMonth` needs no special case: every previous balance is zero, so
 * both branches of the carry-in and the whole overspend sum come out at zero on their own.
 * Only "funds from last month" is seeded, with `openingCents`.
 *
 * Activity naming an envelope that no longer exists is dropped — the FK goes null on delete,
 * so this only happens with a stale input, and silently inventing a row for it would put money
 * in the budget that no envelope can spend.
 */
export function buildBudget(input: BudgetInput): BudgetMonth[] {
  const allocations = new Map<string, AllocationInput>();
  for (const row of input.allocations) {
    cents(row.amountCents, "allocation");
    allocations.set(key(row.month, row.categoryId), row);
  }

  const activity = new Map<string, number>();
  for (const row of input.activity) {
    cents(row.amountCents, "activity");
    const at = key(row.month, row.categoryId);
    activity.set(at, (activity.get(at) ?? 0) + row.amountCents);
  }

  const buffered = new Map<MonthKey, number>();
  for (const row of input.buffered) {
    buffered.set(row.month, cents(row.bufferedCents, "buffered"));
  }

  cents(input.openingCents, "opening position");

  const expenses = input.categories.filter((category) => !category.isIncome);
  const incomes = input.categories.filter((category) => category.isIncome);

  const previousBalance = new Map<string, number>();
  const previousCarryover = new Map<string, boolean>();
  let previousReadyToAssign = 0;
  let previousBuffered = 0;

  const months: BudgetMonth[] = [];

  for (const [index, month] of monthKeyRange(
    input.startMonth,
    input.endMonth,
  ).entries()) {
    const categories: Record<string, CategoryMonth> = {};

    const fromLastMonthCents =
      index === 0 ? input.openingCents : previousReadyToAssign + previousBuffered;

    let lastMonthOverspentCents = 0;
    let totalAssignedCents = 0;
    let totalBalanceCents = 0;
    let totalActivityCents = 0;

    for (const category of expenses) {
      const priorBalance = previousBalance.get(category.id) ?? 0;
      const priorCarryover = previousCarryover.get(category.id) ?? false;

      // Counted here only when the carry-in did *not* take it into the envelope.
      if (!priorCarryover) lastMonthOverspentCents += Math.min(0, priorBalance);

      const carryIn = priorCarryover ? priorBalance : Math.max(0, priorBalance);
      const allocation = allocations.get(key(month, category.id));
      const assignedCents = allocation?.amountCents ?? 0;
      const activityCents = activity.get(key(month, category.id)) ?? 0;
      const balanceCents = assignedCents + activityCents + carryIn;

      categories[category.id] = {
        categoryId: category.id,
        assignedCents,
        activityCents,
        balanceCents,
        carryover: allocation?.carryover ?? false,
      };

      totalAssignedCents += assignedCents;
      totalActivityCents += activityCents;
      totalBalanceCents += balanceCents;

      previousBalance.set(category.id, balanceCents);
      previousCarryover.set(category.id, allocation?.carryover ?? false);
    }

    // Income is not assigned and holds no balance; its activity is the month's income.
    let totalIncomeCents = 0;
    for (const category of incomes) {
      const activityCents = activity.get(key(month, category.id)) ?? 0;
      categories[category.id] = {
        ...ZERO_CATEGORY_MONTH,
        categoryId: category.id,
        activityCents,
      };
      totalIncomeCents += activityCents;
    }

    const availableFundsCents = totalIncomeCents + fromLastMonthCents;
    const bufferedCents = buffered.get(month) ?? 0;
    const readyToAssignCents =
      availableFundsCents +
      lastMonthOverspentCents -
      totalAssignedCents -
      bufferedCents;

    months.push({
      month,
      categories,
      fromLastMonthCents,
      totalIncomeCents,
      availableFundsCents,
      lastMonthOverspentCents,
      totalAssignedCents,
      totalActivityCents,
      totalBalanceCents,
      bufferedCents,
      readyToAssignCents,
      terms: [
        { label: "Funds from last month", cents: fromLastMonthCents },
        { label: "Income this month", cents: totalIncomeCents },
        { label: "Overspent last month", cents: lastMonthOverspentCents },
        { label: "Assigned", cents: -totalAssignedCents },
        { label: "Held for next month", cents: -bufferedCents },
      ],
    });

    previousReadyToAssign = readyToAssignCents;
    previousBuffered = bufferedCents;
  }

  return months;
}

/** The month, or null when the fold does not reach it. */
export function findMonth(
  months: readonly BudgetMonth[],
  month: MonthKey,
): BudgetMonth | null {
  return months.find((entry) => entry.month === month) ?? null;
}

/** One envelope's row for a month, zeroed when it has neither allocation nor activity. */
export function categoryMonth(month: BudgetMonth, categoryId: string): CategoryMonth {
  return month.categories[categoryId] ?? { ...ZERO_CATEGORY_MONTH, categoryId };
}
