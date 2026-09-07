/**
 * Funding scan layer for one envelope: leftover can be positive and still be
 * underfunded.
 *
 * The ask is Assign's (`neededAssigned`). Copy, pill, icon and bar fractions are
 * derived from that gap plus the target horizon — they must not invent a
 * second demand.
 *
 * Spec: `agent-os/specs/2026-08-25-1310-budget-funding-indicators/` D3–D6, as
 * amended by `agent-os/specs/2026-08-28-1000-ynab-target-engine/` Task 8,
 * `agent-os/specs/2026-08-28-2039-target-refill-basis/` D1–D3,
 * `agent-os/specs/2026-08-29-2129-overassigned-available/` D1–D4, and
 * `agent-os/specs/2026-09-06-1301-pile-spent-is-not-a-raid/` D3, and
 * `agent-os/specs/2026-09-07-0804-one-time-savings-goal/` D3, D4.
 */

import { formatUsd } from "@/lib/finances/money";
import { monthName, type MonthKey } from "./envelope";
import { neededAssigned } from "./assign/plan";
import type { AssignEnvelope } from "./assign/types";
import { monthsLeft } from "./targets/cadence";
import { isPeriodFamily, periodCapCents } from "./targets/demand";
import { resolveTarget, type BillSnapshot } from "./targets/derive";

export type IndicatorState =
  | "overspent"
  | "snoozed"
  | "underfunded"
  | "fully-spent"
  | "overassigned"
  | "on-track"
  | "funded"
  | "safe"
  | "idle";

export type IndicatorPill = "red" | "yellow" | "green" | "gray";
export type IndicatorIcon = "clock" | "check" | "pie" | "snooze" | "extra";

export type EnvelopeBar = {
  fill01: number;
  spent01: number;
  striped: boolean;
};

export type EnvelopeIndicator = {
  state: IndicatorState;
  moreNeededCents: number;
  copy: string | null;
  pill: IndicatorPill;
  icon: IndicatorIcon | null;
  bar: EnvelopeBar | null;
};

/**
 * What the envelope is being measured against, and therefore what its bar fills toward.
 *
 * The bar must not invent a second demand (`budget-funding-indicators` D3), so `fill` is
 * whatever the ask itself reads. A **period** refill and an **`upTo` pile** both measure what
 * came *in* — `carry-in + assigned` — and draw spending as the spent overlay rather than as a
 * shortfall; a **`balance` floor** measures what is still sitting there
 * (`pile-spent-is-not-a-raid` D3); and a **`save` goal** measures everything ever put in, so its
 * bar stays full once the goal is met and the purposeful spend shows only as the overlay
 * (`one-time-savings-goal` D3).
 */
type BarFill = "funded" | "available" | "contributed";

type Horizon =
  | { kind: "none" }
  | { kind: "period"; capCents: number }
  | { kind: "sinking"; targetCents: number; fill: BarFill }
  | { kind: "floor"; amountCents: number; fill: BarFill };

function clamp01(value: number): number {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

function spentCents(envelope: AssignEnvelope): number {
  return Math.max(0, -envelope.activityCents);
}

function fundedCents(envelope: AssignEnvelope): number {
  return envelope.carryInCents + envelope.assignedCents;
}

/**
 * Everything ever put in, **including** this month's Assigned — the bar's version of the `save`
 * basis. The ask reads `contributedBeforeCents` and subtracts Assigned itself; a bar that did
 * the same would empty the moment money was assigned. Exactly the relationship `fundedCents`
 * has to the `upTo` carry-in basis.
 */
function contributedCents(envelope: AssignEnvelope): number {
  return envelope.contributedBeforeCents + envelope.assignedCents;
}

function isInactive(envelope: AssignEnvelope): boolean {
  return envelope.status === "paused" || envelope.status === "cancelled";
}

function horizonOf(
  envelope: AssignEnvelope,
  month: MonthKey,
  bills: ReadonlyMap<string, BillSnapshot>,
): Horizon {
  if (isInactive(envelope) || envelope.kind === "income") return { kind: "none" };

  const { target, bill } = resolveTarget(envelope, bills);
  if (!target) return { kind: "none" };

  if (isPeriodFamily(target, bill)) {
    const capCents = periodCapCents(target, month, bill);
    return capCents > 0 ? { kind: "period", capCents } : { kind: "none" };
  }

  const left = monthsLeft(target.cadence, month, bill ?? undefined);
  // Both arms, not just `sinking`: a deadline-free goal has no months left and lands in `floor`
  // (`pile-spent-is-not-a-raid` Changes #2), and that is the arm House sits in.
  const fill: BarFill =
    target.behavior === "balance"
      ? "available"
      : target.behavior === "save"
        ? "contributed"
        : "funded";
  return left !== null && left > 0
    ? { kind: "sinking", targetCents: target.amountCents, fill }
    : { kind: "floor", amountCents: target.amountCents, fill };
}

/** The bar basis this horizon reads — `null` when there is no target, or a period cap. */
function fillOf(horizon: Horizon): BarFill | null {
  return horizon.kind === "sinking" || horizon.kind === "floor" ? horizon.fill : null;
}

function fillsWith(
  horizon: Horizon,
  bases: { funded: number; available: number; contributed: number },
): number {
  switch (fillOf(horizon)) {
    case "available":
      return bases.available;
    case "contributed":
      return bases.contributed;
    // A period cap and a target-less envelope both answer "was enough put in".
    default:
      return bases.funded;
  }
}

function barToward(funded: number, target: number, spent: number): EnvelopeBar {
  return {
    fill01: target > 0 ? clamp01(funded / target) : 1,
    spent01: clamp01(spent / Math.max(funded, 1)),
    striped: false,
  };
}

export function envelopeIndicator(
  envelope: AssignEnvelope,
  month: MonthKey,
  bills: ReadonlyMap<string, BillSnapshot>,
): EnvelopeIndicator {
  const available = envelope.balanceCents;
  const spent = spentCents(envelope);
  const funded = fundedCents(envelope);
  const contributed = contributedCents(envelope);
  const { needed } = isInactive(envelope)
    ? { needed: 0 }
    : neededAssigned(envelope, month, bills);
  const moreNeededCents = Math.max(0, needed - envelope.assignedCents);
  const horizon = horizonOf(envelope, month, bills);
  const asked = horizon.kind !== "none";
  const periodTarget =
    horizon.kind === "period"
      ? horizon.capCents
      : horizon.kind === "sinking"
        ? horizon.targetCents
        : horizon.kind === "floor"
          ? horizon.amountCents
          : envelope.carryInCents + needed;
  // The bar answers the ask's own question. A refill and an `upTo` pile ask whether enough has
  // been put in, so they fill with `funded` and the spending shows as the overlay; a `balance`
  // floor asks whether the money is still there, so it fills with Available; a `save` goal asks
  // whether enough has ever gone in, so it fills with contribution. Without that last one the
  // bar would drop to 95% the month after the down payment went out while the ask said $0 — the
  // second opinion D3 exists to prevent.
  const barBasis = fillsWith(horizon, { funded, available, contributed });
  const askBar = barToward(barBasis, Math.max(periodTarget, 1), spent);

  if (available < 0) {
    return {
      state: "overspent",
      moreNeededCents,
      copy: null,
      pill: "red",
      icon: null,
      bar: { fill01: 1, spent01: 0, striped: false },
    };
  }

  // After `overspent`, so overspending still wins: snooze silences an *ask*, never money that
  // is already gone (`target-snooze` D4). A state of its own rather than a badge on `funded`,
  // because a $0 snoozed envelope reporting "Funded" is a lie the grid tells.
  if (envelope.snoozed) {
    return {
      state: "snoozed",
      moreNeededCents,
      copy: `Snoozed for ${monthName(month)}`,
      pill: available > 0 ? "green" : "gray",
      icon: "snooze",
      bar: askBar,
    };
  }

  if (asked && moreNeededCents > 0) {
    return {
      state: "underfunded",
      moreNeededCents,
      copy: `${formatUsd(moreNeededCents)} more needed this month`,
      pill: "yellow",
      icon: "clock",
      bar: askBar,
    };
  }

  if (available === 0 && spent > 0) {
    return {
      state: "fully-spent",
      moreNeededCents: 0,
      copy: "Fully Spent",
      pill: "gray",
      icon: "check",
      bar: { fill01: 1, spent01: 1, striped: true },
    };
  }

  // Assigned above this month's ask is raidable without missing the ask. Fully-spent
  // already won at $0 Available; On Track is only exact-installment with pile remaining.
  const extraCents = envelope.assignedCents - needed;
  if (asked && extraCents > 0 && available > 0) {
    return {
      state: "overassigned",
      moreNeededCents: 0,
      copy: `${formatUsd(extraCents)} extra`,
      pill: "green",
      icon: "extra",
      bar: {
        fill01: 1,
        spent01: clamp01(spent / Math.max(funded, 1)),
        striped: false,
      },
    };
  }

  // On Track reads the same basis as the ask and the bar: a half-saved goal is on track against
  // what has gone in, never against what this month funded.
  if (asked && horizon.kind === "sinking" && barBasis < horizon.targetCents) {
    return {
      state: "on-track",
      moreNeededCents: 0,
      copy: "On Track",
      pill: "green",
      icon: "pie",
      bar: barToward(barBasis, horizon.targetCents, spent),
    };
  }

  if (asked) {
    // A finished goal says so on the existing `funded` state rather than earning a rung of its
    // own. Nothing is stored, so it expires by itself in both directions: take the money back
    // out and it is no longer met (`one-time-savings-goal` D4).
    const copy =
      fillOf(horizon) === "contributed" && barBasis >= periodTarget
        ? `Goal met — ${formatUsd(periodTarget)} saved`
        : spent > 0 && available > 0
          ? `Funded. Spent ${formatUsd(spent)} of ${formatUsd(Math.max(periodTarget, spent))}`
          : "Funded";
    return {
      state: "funded",
      moreNeededCents: 0,
      copy,
      pill: "green",
      icon: "check",
      bar: {
        fill01: 1,
        spent01: clamp01(spent / Math.max(funded, 1)),
        striped: false,
      },
    };
  }

  if (available > 0) {
    return {
      state: "safe",
      moreNeededCents: 0,
      copy: null,
      pill: "green",
      icon: "check",
      bar: {
        fill01: 1,
        spent01: clamp01(spent / Math.max(funded, 1)),
        striped: false,
      },
    };
  }

  return {
    state: "idle",
    moreNeededCents: 0,
    copy: null,
    pill: "gray",
    icon: null,
    bar: null,
  };
}

/** One indicator per spending envelope, same inputs Assign already folds. */
export function indicatorsFromAssign(
  month: MonthKey,
  envelopes: readonly AssignEnvelope[],
  bills: ReadonlyMap<string, BillSnapshot>,
): Map<string, EnvelopeIndicator> {
  const result = new Map<string, EnvelopeIndicator>();
  for (const envelope of envelopes) {
    if (envelope.kind === "income") continue;
    result.set(envelope.id, envelopeIndicator(envelope, month, bills));
  }
  return result;
}
