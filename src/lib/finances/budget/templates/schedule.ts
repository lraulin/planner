/**
 * How much a bill envelope wants assigned this month — its intrinsic funding demand.
 *
 * **Before `agent-os/specs/2026-08-23-2313-one-budget/`**, a bill funded an envelope through a
 * `{type: "schedule", scheduleId}` template line pointing at a `finance_schedules` row whose
 * recurrence was Actual's `RecurConfig`. That row is gone: a bill envelope now carries its own
 * cadence directly (`kind = 'bill'` columns on `finance_budget_categories`), and its demand is
 * computed here rather than declared as a template line — every bill funds itself, with
 * nothing to add or remove from the templates editor.
 *
 * **The math is still Actual's** for weekly/daily sums and for yearly/quarterly sinking
 * (`packages/loot-core/src/server/budget/schedule-template.ts`, MIT, © James Long). Monthly
 * (`n = 1`) bills diverge: Actual would sink `remaining / (monthsUntil + 1)` when the next
 * charge is next month (half of rent in August). This app asks for the full amount in the due
 * month and $0 otherwise — next month's rent is funded by assigning in next month
 * (`agent-os/specs/2026-08-25-1154-month-ahead-zero-based/` D1).
 *
 * Day cadences (weekly, biweekly, 28-day) still sum occurrences in the viewed month.
 *
 * **One bill, one demand — no batching.** Actual's `runSchedules` spends one carry-in across
 * several schedule templates stacked on one envelope. A bill envelope now *is* one obligation,
 * so that batching is gone; `billFundingDemand` is the whole answer for one envelope in one
 * month.
 *
 * Sign: `expectedCents` is unsigned (positive cents the bill costs) — unlike Actual's signed
 * `getScheduledAmount`, there is no second sign convention to strip here.
 */

import { shiftDateKey } from "@/lib/schedule/geometry";
import { monthKeyOf, nextMonthKey, type MonthKey } from "../envelope";
import { cadenceOf, type Cadence } from "@/lib/finances/recurringBills";
import { monthsBetween, monthsUntilDate } from "./monthSpan";
import { assertCents } from "./types";

export type BillSnapshot = {
  id: string;
  name: string;
  /** Active only — a paused or cancelled bill is filtered out before this module sees it. */
  cadenceMonths: number;
  cadenceDays: number | null;
  /** Unsigned cents. Zero means nothing to fund. */
  expectedCents: number;
  /** The next charge at or after today — `billAnchor(...).nextDueKey` from `commitments.ts`. */
  nextDueKey: string;
  /**
   * The charge being waited for; may be in the past. Demand counting uses this, not
   * `nextDueKey`, so a late unpaid bill keeps asking.
   */
  expectedKey?: string | null;
};

export type BillDemandResult = {
  toBudgetCents: number;
  error: string | null;
};

function fillAmount(snapshot: BillSnapshot): number {
  return assertCents(snapshot.expectedCents, "bill amount");
}

function cadenceOfSnapshot(snapshot: BillSnapshot): Cadence {
  return cadenceOf({
    cadenceMonths: snapshot.cadenceMonths,
    cadenceDays: snapshot.cadenceDays,
  });
}

/** Every day cadence this app offers (weekly, biweekly, 28-day) sums occurrences in month. */
function alwaysPayThisMonth(cadence: Cadence): boolean {
  return cadence.unit === "day" && cadence.n <= 31;
}

/**
 * Every occurrence of a **day cadence** (weekly, biweekly, 28-day) that falls within `month`.
 * Only called from the `alwaysPayThisMonth` branch, so `cadence.unit` is always `"day"` here —
 * a month cadence never sums occurrences, it either fires once or sinks.
 */
function occurrencesInMonth(snapshot: BillSnapshot, month: MonthKey): string[] {
  const cadence = cadenceOfSnapshot(snapshot);
  const step = cadence.unit === "day" ? cadence.n : 1;
  const monthStart = month;
  // MonthKey is already YYYY-MM-01. Appending "-01" made the exclusive end
  // "2026-09-01-01", so the 1st of next month compared as still inside this month.
  const monthEnd = nextMonthKey(month);

  // Walk backward from the next-due anchor to before the month, then forward through it —
  // bounded by the cadence, never by a fixed step count.
  let cursor = snapshot.nextDueKey;
  while (cursor >= monthStart) cursor = shiftDateKey(cursor, -step);
  cursor = shiftDateKey(cursor, step);

  const dates: string[] = [];
  while (cursor < monthEnd) {
    if (cursor >= monthStart) dates.push(cursor);
    cursor = shiftDateKey(cursor, step);
  }
  return dates;
}

function isMonthlyOnce(cadence: Cadence): boolean {
  return cadence.unit === "month" && cadence.n === 1;
}

function isPayThisMonth(snapshot: BillSnapshot): boolean {
  return alwaysPayThisMonth(cadenceOfSnapshot(snapshot));
}

function thisMonthNeed(snapshot: BillSnapshot, month: MonthKey): number {
  const amount = fillAmount(snapshot);
  const cadence = cadenceOfSnapshot(snapshot);
  if (alwaysPayThisMonth(cadence)) {
    return amount * occurrencesInMonth(snapshot, month).length;
  }
  return amount;
}

/**
 * Base monthly contribution used when the envelope already holds enough to cover the next
 * charge — Actual's `getMonthlyBaseContribution`. `amount / n` is the whole formula once
 * `Cadence.n` already means "months between charges" for a month cadence, and "days between
 * charges, converted to a month span" for a day cadence.
 */
export function baseMonthlyContribution(snapshot: BillSnapshot): number {
  const amount = fillAmount(snapshot);
  const cadence = cadenceOfSnapshot(snapshot);
  if (cadence.unit === "month") return amount / cadence.n;
  const prev = monthKeyOf(shiftDateKey(snapshot.nextDueKey, -cadence.n));
  const span = Math.max(1, monthsBetween(prev, monthKeyOf(snapshot.nextDueKey)));
  return amount / span;
}

/**
 * Sinking contribution: remaining / (months until due + 1), reduced by carry-in —
 * Actual's `getSinkingContributionBreakdown` for the single-bill case.
 */
function sinkingContribution(
  snapshot: BillSnapshot,
  month: MonthKey,
  carryInCents: number,
): number {
  const target = fillAmount(snapshot);
  const numMonths = Math.max(0, monthsUntilDate(month, snapshot.nextDueKey));
  const remaining = target - carryInCents;
  if (remaining <= 0) return 0;
  return Math.round(remaining / (numMonths + 1));
}

/** What one bill envelope wants assigned this month, given its current carry-in. */
export function billFundingDemand(
  snapshot: BillSnapshot,
  month: MonthKey,
  carryInCents: number,
): BillDemandResult {
  assertCents(carryInCents, "carry-in");
  if (fillAmount(snapshot) === 0) return { toBudgetCents: 0, error: null };

  const cadence = cadenceOfSnapshot(snapshot);
  const amount = fillAmount(snapshot);
  if (isMonthlyOnce(cadence)) {
    if (monthsUntilDate(month, snapshot.nextDueKey) !== 0) {
      return { toBudgetCents: 0, error: null };
    }
    if (carryInCents >= amount) return { toBudgetCents: 0, error: null };
    return { toBudgetCents: amount, error: null };
  }

  if (isPayThisMonth(snapshot)) {
    return { toBudgetCents: thisMonthNeed(snapshot, month), error: null };
  }

  if (carryInCents >= amount) {
    return {
      toBudgetCents: Math.round(baseMonthlyContribution(snapshot)),
      error: null,
    };
  }
  return {
    toBudgetCents: sinkingContribution(snapshot, month, carryInCents),
    error: null,
  };
}
