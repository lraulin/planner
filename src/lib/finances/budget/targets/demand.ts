/**
 * How much an envelope asks to have **Assigned** this month.
 *
 * One function, shared by the target editor's preview, by the funding indicator, and by
 * Underfunded. If those three ever disagree the indicator is wrong
 * (`budget-funding-indicators` D3), and the only way to guarantee they cannot is to have one
 * of these.
 *
 * The engine returns *needed assigned*, so `gap = max(0, needed − assigned)` is unchanged from
 * `budget-assign-options` D3 and `gap = max(0, target − Available)` falls out of the identity
 * `balance = assigned + activity + carryIn` rather than being special-cased.
 *
 * **The load-bearing claim: balance-style targets measure against Available, never carry-in.**
 * Assigned is a history of funding; Available is what can still buy groceries. Spending reduces
 * Available, so `upTo` and `balance` ask you to top back up. `weekly-envelope-targets` D3 said
 * carry-in must never reduce a weekly ask, and its premise — a cheap week is spare cash, not
 * lower demand — is still true; the conclusion drawn from it was wrong. The per-occurrence
 * amount does not fall ($210.96 stays $210.96); what you must *add* falls, because the money is
 * already sitting in the envelope. Move it elsewhere and Available drops and the ask returns.
 *
 * Spec: `agent-os/specs/2026-08-28-1000-ynab-target-engine/` D3, D4.
 */

import type { MonthKey } from "../envelope";
import {
  monthsLeft,
  remainingOccurrences,
  scheduleSpreads,
  wholeOccurrences,
  type ScheduleBill,
} from "./cadence";
import { resolveTarget, type BillSnapshot, type TargetHolder } from "./derive";
import { assertCents, type Target } from "./types";

export type DemandEnvelope = TargetHolder & {
  name: string;
  carryInCents: number;
  activityCents: number;
};

export type TargetDemand = {
  /** Needed assigned for this month. */
  amount: number;
  /**
   * What a deadline-free `balance` still wants, in total, with no month to want it by. Null
   * for every other shape. It is reported, never funded — see `spread`.
   */
  eventuallyCents: number | null;
  errors: string[];
};

/** Available **excluding** this month's Assigned — the figure every balance-style ask reads. */
export function availableBefore(envelope: {
  carryInCents: number;
  activityCents: number;
}): number {
  return (
    assertCents(envelope.carryInCents, "carry-in") +
    assertCents(envelope.activityCents, "activity")
  );
}

/** Whether the ask is due inside this month rather than at some future one. */
function isOccurrenceCounted(target: Target, bill: ScheduleBill | null): boolean {
  switch (target.cadence.unit) {
    case "week":
    case "month":
      return true;
    case "schedule":
      // A quarterly or yearly bill is saved toward across the months before its charge; every
      // other bill cadence lands inside the month it is counted in.
      return bill ? !scheduleSpreads(bill) : false;
    default:
      return false;
  }
}

function occurrenceDemand(
  target: Target,
  month: MonthKey,
  todayKey: string,
  before: number,
  bill: ScheduleBill | null,
): number {
  const amount = assertCents(target.amountCents, "target amount");
  if (target.behavior === "add") {
    // Whole month, always: a contribution is not coverage of trips, so skipping one occurrence
    // does not make the month cheaper (`weekly-envelope-targets` D2, where its argument holds).
    return amount * wholeOccurrences(target.cadence, month, bill ?? undefined);
  }
  const remaining = remainingOccurrences(
    target.cadence,
    month,
    todayKey,
    bill ?? undefined,
  );
  return Math.max(0, amount * remaining - before);
}

function spreadDemand(
  target: Target,
  month: MonthKey,
  before: number,
  bill: ScheduleBill | null,
): number {
  const amount = assertCents(target.amountCents, "target amount");
  const left = monthsLeft(target.cadence, month, bill ?? undefined);
  // No deadline means no month is the month this has to happen in, so it funds nothing. The
  // hole is still real, and `eventuallyCents` reports it; a floor you must refill forever is
  // not an emergency every month.
  if (left === null) return 0;
  return Math.max(0, Math.round((amount - before) / (left + 1)));
}

/** What one resolved target asks for, given the envelope's Available before assignment. */
export function demandForTarget(
  target: Target,
  month: MonthKey,
  todayKey: string,
  before: number,
  bill: ScheduleBill | null = null,
): number {
  return isOccurrenceCounted(target, bill)
    ? occurrenceDemand(target, month, todayKey, before, bill)
    : spreadDemand(target, month, before, bill);
}

/** What this envelope asks for this month — the one ask the whole Budget page reads. */
export function targetDemand(
  envelope: DemandEnvelope,
  month: MonthKey,
  todayKey: string,
  bills: ReadonlyMap<string, BillSnapshot>,
): TargetDemand {
  const { target, bill, errors } = resolveTarget(envelope, bills);
  if (!target) return { amount: 0, eventuallyCents: null, errors };
  const before = availableBefore(envelope);
  return {
    amount: demandForTarget(target, month, todayKey, before, bill),
    eventuallyCents:
      target.cadence.unit === "none" ? Math.max(0, target.amountCents - before) : null,
    errors,
  };
}
