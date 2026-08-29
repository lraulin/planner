/**
 * How much an envelope asks to have **Assigned** this month.
 *
 * One function, shared by the target editor's preview, by the funding indicator, and by
 * Underfunded. If those three ever disagree the indicator is wrong
 * (`budget-funding-indicators` D3), and the only way to guarantee they cannot is to have one
 * of these.
 *
 * The engine returns *needed assigned*, so `gap = max(0, needed − assigned)` is unchanged from
 * `budget-assign-options` D3.
 *
 * **The load-bearing claim: two families, two bases.** The line is whether the money is spent
 * inside the month it is asked for or held for a later one.
 *
 * - A **period refill** (`week`, `month`, a bill that charges inside the month) is an
 *   assignment question. Activity is consumption of funding, not a new demand for it: spending
 *   money that was already assigned for that spending cannot ask for it again. `add` asks the
 *   whole cap, `upTo` asks the cap less what carried in. This is YNAB's answer, verified
 *   empirically — same target, same four charges, same money assigned, "You've met your target".
 * - A **pile** (`year`, `by`, `none`, a quarterly or yearly bill) is a savings question. What is
 *   actually in the pile is the right measure, so it reads Available and raiding one asks for it
 *   back.
 *
 * `assignedToZeroBalance` (`assign/plan.ts`) still floors every ask, which is what keeps
 * overspend visible without putting Activity back into a refill's basis.
 *
 * Spec: `agent-os/specs/2026-08-28-1000-ynab-target-engine/` D3, D4, as superseded by
 * `agent-os/specs/2026-08-28-2039-target-refill-basis/` D1–D3.
 */

import type { MonthKey } from "../envelope";
import {
  monthsLeft,
  outstandingCharges,
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
  errors: string[];
};

/** Available **excluding** this month's Assigned — the figure every *pile* ask reads. */
export function availableBefore(envelope: {
  carryInCents: number;
  activityCents: number;
}): number {
  return (
    assertCents(envelope.carryInCents, "carry-in") +
    assertCents(envelope.activityCents, "activity")
  );
}

/**
 * Whether this target's money is spent inside the month it is asked for (a period refill)
 * rather than held toward a later one (a pile).
 */
export function isPeriodFamily(target: Target, bill: ScheduleBill | null): boolean {
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

/**
 * The whole month's cap for a period target: the amount times every anchor the month holds.
 *
 * A bill counts its **outstanding** charges rather than the calendar's, which is what keeps a
 * late bill asking, stops a paid one, and keeps a monthly bill asking its full amount in the due
 * month and $0 in every other (`month-ahead-zero-based` D1).
 */
export function periodCapCents(
  target: Target,
  month: MonthKey,
  bill: ScheduleBill | null,
): number {
  const amount = assertCents(target.amountCents, "target amount");
  const occurrences =
    target.cadence.unit === "schedule"
      ? bill
        ? outstandingCharges(bill, month)
        : 0
      : wholeOccurrences(target.cadence, month, undefined, target.since);
  return amount * occurrences;
}

function periodDemand(
  target: Target,
  month: MonthKey,
  carryInCents: number,
  bill: ScheduleBill | null,
): number {
  const cap = periodCapCents(target, month, bill);
  // `add` is a contribution: what is already in the envelope is beside the point. `upTo` is a
  // refill, and money that carried in is money the month does not have to assign again — YNAB's
  // rule that leftovers count toward the target only once the new month begins.
  if (target.behavior === "add") return cap;
  return Math.max(0, cap - assertCents(carryInCents, "carry-in"));
}

function pileDemand(
  target: Target,
  month: MonthKey,
  before: number,
  bill: ScheduleBill | null,
): number {
  const amount = assertCents(target.amountCents, "target amount");
  const left = monthsLeft(target.cadence, month, bill ?? undefined);
  // No deadline is not no ask. A floor you have raided has to nag now, or the one shape whose
  // whole job is to stay full is the one shape that never asks (`target-refill-basis` D3).
  if (left === null) return Math.max(0, amount - before);
  return Math.max(0, Math.round((amount - before) / (left + 1)));
}

/** What one resolved target asks for, given the envelope's carry-in and activity. */
export function demandForTarget(
  target: Target,
  month: MonthKey,
  envelope: { carryInCents: number; activityCents: number },
  bill: ScheduleBill | null = null,
): number {
  return isPeriodFamily(target, bill)
    ? periodDemand(target, month, envelope.carryInCents, bill)
    : pileDemand(target, month, availableBefore(envelope), bill);
}

/** What this envelope asks for this month — the one ask the whole Budget page reads. */
export function targetDemand(
  envelope: DemandEnvelope,
  month: MonthKey,
  bills: ReadonlyMap<string, BillSnapshot>,
): TargetDemand {
  const { target, bill, errors } = resolveTarget(envelope, bills);
  if (!target) return { amount: 0, errors };
  return { amount: demandForTarget(target, month, envelope, bill), errors };
}
