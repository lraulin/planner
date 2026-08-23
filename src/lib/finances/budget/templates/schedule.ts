/**
 * How much a schedule template wants to assign this month.
 *
 * **Reimplemented from Actual Budget** — `packages/loot-core/src/server/budget/schedule-template.ts`
 * (MIT, © James Long). Pay-this-month vs sinking, weekly/daily summing occurrences in the
 * month, and the already-funded fallback to the base monthly rate. Rewritten over our
 * `YYYY-MM-DD` keys; do not port `monthUtils`.
 *
 * Sign: `getScheduledAmount` is negative for a bill; Assigned is a positive fill — take
 * the absolute value here, once.
 *
 * Spec: `agent-os/specs/2026-08-22-2242-budget-goal-templates/` D4.
 */

import { shiftDateKey } from "@/lib/schedule/geometry";
import { monthEndKey, monthKeyOf, type MonthKey } from "../envelope";
import { occurrences, type RecurConfig } from "@/lib/finances/schedules/recur";
import { monthsBetween, monthsUntilDate } from "./monthSpan";
import { assertCents, type ScheduleTemplate } from "./types";

export type ScheduleSnapshot = {
  id: string;
  name: string;
  completed: boolean;
  /** Signed integer cents, positive is money in. A $50 bill is −5000. */
  amountCents: number;
  nextDate: string;
  config: RecurConfig;
};

export type ScheduleLineResult = {
  toBudget: number;
  error: string | null;
};

function fillAmount(snapshot: ScheduleSnapshot): number {
  return Math.abs(assertCents(snapshot.amountCents, "schedule amount"));
}

function intervalOf(config: RecurConfig): number {
  const n = config.interval ?? 1;
  return n < 1 ? 1 : n;
}

function occurrencesInMonth(config: RecurConfig, month: MonthKey): string[] {
  const end = monthEndKey(month);
  return occurrences(config, month, 64).filter((key) => key >= month && key <= end);
}

function isPayThisMonth(
  template: ScheduleTemplate,
  snapshot: ScheduleSnapshot,
  month: MonthKey,
): boolean {
  if (template.full) return true;
  const interval = intervalOf(snapshot.config);
  const frequency = snapshot.config.frequency;
  const dueThisMonth = monthsUntilDate(month, snapshot.nextDate) === 0;
  if (
    (frequency === "monthly" || frequency === undefined) &&
    interval === 1 &&
    dueThisMonth
  ) {
    return true;
  }
  if (frequency === "weekly" && interval <= 4) return true;
  if (frequency === "daily" && interval <= 31) return true;
  return false;
}

function thisMonthNeed(snapshot: ScheduleSnapshot, month: MonthKey): number {
  const amount = fillAmount(snapshot);
  const frequency = snapshot.config.frequency;
  if (frequency === "weekly" || frequency === "daily") {
    return amount * occurrencesInMonth(snapshot.config, month).length;
  }
  return amount;
}

/**
 * Base monthly contribution used when the envelope already holds enough to cover upcoming
 * schedules — Actual's `getMonthlyBaseContribution`.
 */
export function baseMonthlyContribution(snapshot: ScheduleSnapshot): number {
  const amount = fillAmount(snapshot);
  const interval = intervalOf(snapshot.config);
  switch (snapshot.config.frequency) {
    case "yearly":
      return amount / interval / 12;
    case "monthly":
      return amount / interval;
    case "weekly":
    case "daily": {
      const unit = snapshot.config.frequency === "weekly" ? 7 : 1;
      const prev = monthKeyOf(shiftDateKey(snapshot.nextDate, -(interval * unit)));
      const span = Math.max(1, monthsBetween(prev, monthKeyOf(snapshot.nextDate)));
      return amount / span;
    }
    default:
      return amount / interval;
  }
}

/**
 * Sinking contribution: remaining / (months until due + 1), reduced by carry-in.
 *
 * Actual's `getSinkingContributionBreakdown` walks schedules in next-date order and spends
 * carry-in against the first one. One schedule is the common case here (stacked on Bills
 * they still share one carry-in, processed earliest-due first).
 */
export function sinkingContribution(
  snapshots: readonly ScheduleSnapshot[],
  month: MonthKey,
  carryInCents: number,
): number {
  let remainder = carryInCents;
  let total = 0;
  const ordered = [...snapshots].sort((a, b) => a.nextDate.localeCompare(b.nextDate));
  for (const snapshot of ordered) {
    const target = fillAmount(snapshot);
    const numMonths = Math.max(0, monthsUntilDate(month, snapshot.nextDate));
    const remaining = target - remainder;
    if (remaining <= 0) {
      remainder = -remaining;
      continue;
    }
    remainder = 0;
    total += remaining / (numMonths + 1);
  }
  return Math.round(total);
}

export function runScheduleLine(
  template: ScheduleTemplate,
  snapshot: ScheduleSnapshot | undefined,
  month: MonthKey,
  carryInCents: number,
): ScheduleLineResult {
  assertCents(carryInCents, "carry-in");
  if (!snapshot) {
    return { toBudget: 0, error: "Schedule does not exist" };
  }
  if (snapshot.completed) {
    return { toBudget: 0, error: `Schedule ${snapshot.name} is completed` };
  }
  if (fillAmount(snapshot) === 0) {
    return { toBudget: 0, error: null };
  }

  const numMonths = monthsUntilDate(month, snapshot.nextDate);
  if (numMonths < 0 && snapshot.config.endMode && snapshot.config.endMode !== "never") {
    return { toBudget: 0, error: `Schedule ${snapshot.name} is in the past` };
  }

  if (isPayThisMonth(template, snapshot, month)) {
    if (template.full && numMonths > 0) return { toBudget: 0, error: null };
    if (
      numMonths > 0 &&
      snapshot.config.frequency !== "weekly" &&
      snapshot.config.frequency !== "daily"
    ) {
      return { toBudget: 0, error: null };
    }
    return { toBudget: thisMonthNeed(snapshot, month), error: null };
  }

  const upcoming = fillAmount(snapshot);
  if (carryInCents >= upcoming) {
    return { toBudget: Math.round(baseMonthlyContribution(snapshot)), error: null };
  }
  return {
    toBudget: sinkingContribution([snapshot], month, carryInCents),
    error: null,
  };
}

/**
 * All schedule templates on one envelope, batched so carry-in is spent once across them
 * (Actual runs `runSchedule` once per priority bucket).
 */
export function runSchedules(
  templates: readonly ScheduleTemplate[],
  snapshots: ReadonlyMap<string, ScheduleSnapshot>,
  month: MonthKey,
  carryInCents: number,
): { toBudget: number; errors: string[]; perTemplate: Map<string, number> } {
  const perTemplate = new Map<string, number>();
  const errors: string[] = [];
  const pay: { template: ScheduleTemplate; snapshot: ScheduleSnapshot }[] = [];
  const sinking: { template: ScheduleTemplate; snapshot: ScheduleSnapshot }[] = [];

  for (const template of templates) {
    const snapshot = snapshots.get(template.scheduleId);
    if (!snapshot) {
      perTemplate.set(template.id, 0);
      errors.push("Schedule does not exist");
      continue;
    }
    if (snapshot.completed) {
      perTemplate.set(template.id, 0);
      errors.push(`Schedule ${snapshot.name} is completed`);
      continue;
    }
    if (isPayThisMonth(template, snapshot, month)) {
      pay.push({ template, snapshot });
    } else {
      sinking.push({ template, snapshot });
    }
  }

  let payTotal = 0;
  for (const { template, snapshot } of pay) {
    const numMonths = monthsUntilDate(month, snapshot.nextDate);
    if (template.full && numMonths > 0) {
      perTemplate.set(template.id, 0);
      continue;
    }
    if (
      numMonths > 0 &&
      snapshot.config.frequency !== "weekly" &&
      snapshot.config.frequency !== "daily"
    ) {
      perTemplate.set(template.id, 0);
      continue;
    }
    const need = thisMonthNeed(snapshot, month);
    perTemplate.set(template.id, need);
    payTotal += need;
  }

  const sinkingSnaps = sinking.map((entry) => entry.snapshot);
  const sinkingTotalNeed = sinkingSnaps.reduce(
    (sum, snap) => sum + fillAmount(snap),
    0,
  );

  let sinkingTotal: number;
  if (carryInCents >= sinkingTotalNeed + payTotal && sinkingSnaps.length > 0) {
    sinkingTotal = Math.round(
      sinkingSnaps.reduce((sum, snap) => sum + baseMonthlyContribution(snap), 0),
    );
    for (const { template, snapshot } of sinking) {
      perTemplate.set(template.id, Math.round(baseMonthlyContribution(snapshot)));
    }
  } else if (sinkingSnaps.length === 0) {
    sinkingTotal = 0;
  } else {
    sinkingTotal = sinkingContribution(sinkingSnaps, month, carryInCents);
    // Attribute by each schedule's sinking share; last absorbs rounding.
    let leftover = sinkingTotal;
    sinking.forEach((entry, index) => {
      const isLast = index === sinking.length - 1;
      const share = isLast
        ? leftover
        : sinkingContribution([entry.snapshot], month, index === 0 ? carryInCents : 0);
      const allocated = Math.max(0, Math.min(share, leftover));
      perTemplate.set(entry.template.id, allocated);
      leftover -= allocated;
    });
  }

  return { toBudget: payTotal + sinkingTotal, errors, perTemplate };
}
