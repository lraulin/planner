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
 * **The load-bearing claim: three bases, one spread — the behaviour picks the basis and the
 * cadence picks the spread.**
 *
 * The **cadence** decides the spread. A **period refill** (`week`, `month`, a bill that charges
 * inside the month) asks its whole cap now; a **pile** (`year`, `by`, `none`, a quarterly or
 * yearly bill) spreads the hole across the months it has left.
 *
 * The **behaviour** decides what the hole is measured against:
 *
 * - `add` is a contribution — it asks the whole cap, whatever is in the envelope.
 * - `upTo` is a **spending** target: the money is meant to leave, so what came *in* is the
 *   measure. It asks the cap less **carry-in**, and activity is consumption of funding rather
 *   than a new demand for it — spending money that was already assigned for that spending
 *   cannot ask for it again. That holds for the last pizza of the month and equally for the
 *   yearly bill in the month it is charged.
 * - `balance` is a **floor**: what is sitting in the envelope is the whole point, so it asks the
 *   amount less **Available**, and raiding one asks for it back.
 * - `save` is a **goal you finish**: it asks the amount less **contribution since the target
 *   started** — everything ever put in, including whatever was already there. Spending it is
 *   completion rather than consumption, so a met goal stays met; assigning money back *out*
 *   reduces the contribution and re-opens the ask. No month-local basis can say that: carry-in
 *   would leave $95,000 against a $100,000 cap and ask for $5,000 every month forever, because
 *   carry-in measures a cycle and a one-time goal has no next cycle
 *   (`one-time-savings-goal` D2).
 *
 * All three bases exclude **this month's Assigned**, because the answer is *needed assigned for
 * this month* and every reader subtracts what is already assigned from it.
 *
 * `assignedToZeroBalance` (`assign/plan.ts`) still floors every ask, which is what keeps
 * overspend visible without putting Activity back into an `upTo` basis. The cost of the `upTo`
 * basis is that a raid in an accumulation month is asked for through the *next* month's
 * carry-in rather than the same day (`pile-spent-is-not-a-raid` D2) — a cost the `save` basis
 * does not pay, since a withdrawal is an allocation and lands the same month.
 *
 * Spec: `agent-os/specs/2026-08-28-1000-ynab-target-engine/` D3, D4, as superseded by
 * `agent-os/specs/2026-08-28-2039-target-refill-basis/` D1–D3 and
 * `agent-os/specs/2026-09-06-1301-pile-spent-is-not-a-raid/` D1, and extended by
 * `agent-os/specs/2026-09-07-0804-one-time-savings-goal/` D2.
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
  /**
   * Everything put into this envelope since its target started asking, **excluding** this
   * month's Assigned — the **contribution** basis, read by `save` targets alone. Supplied by
   * `buildBudget`, which is target-agnostic and only answers "how much had gone in by month M".
   */
  contributedBeforeCents: number;
};

/** The three bases a pile may measure against, all supplied by the caller. */
type PileBases = {
  carryInCents: number;
  activityCents: number;
  contributedBeforeCents: number;
};

export type TargetDemand = {
  /** Needed assigned for this month. */
  amount: number;
  errors: string[];
};

/**
 * Available **excluding** this month's Assigned — the **floor** basis, read by `balance`
 * targets alone (`pile-spent-is-not-a-raid` D1).
 */
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
  envelope: PileBases,
  bill: ScheduleBill | null,
): number {
  const amount = assertCents(target.amountCents, "target amount");
  // A `balance` pile is a floor, so it measures Available and a raid asks for it back. An
  // `upTo` pile is saving toward a spend, so it measures carry-in — paying the bill the pile
  // was for must not demand the whole year back in the charge month. A `save` goal is finished
  // by being spent, so it measures contribution: only taking the money back out re-opens it.
  const before =
    target.behavior === "balance"
      ? availableBefore(envelope)
      : target.behavior === "save"
        ? assertCents(envelope.contributedBeforeCents, "contribution")
        : assertCents(envelope.carryInCents, "carry-in");
  const left = monthsLeft(target.cadence, month, bill ?? undefined);
  // No deadline is not no ask. A floor you have raided has to nag now, or the one shape whose
  // whole job is to stay full is the one shape that never asks (`target-refill-basis` D3).
  if (left === null) return Math.max(0, amount - before);
  return Math.max(0, Math.round((amount - before) / (left + 1)));
}

/** What one resolved target asks for, given the envelope's carry-in, activity and contribution. */
export function demandForTarget(
  target: Target,
  month: MonthKey,
  envelope: PileBases,
  bill: ScheduleBill | null = null,
): number {
  return isPeriodFamily(target, bill)
    ? periodDemand(target, month, envelope.carryInCents, bill)
    : pileDemand(target, month, envelope, bill);
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
