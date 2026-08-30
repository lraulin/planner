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
 * `agent-os/specs/2026-08-28-2039-target-refill-basis/` D1–D3, and
 * `agent-os/specs/2026-08-29-2129-overassigned-available/` D1–D4.
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
 * A **period** refill fills with `carry-in + assigned` toward the month's cap, because that is
 * exactly the comparison the ask makes; spending is drawn as the spent overlay, not as a
 * shortfall. A **pile** — sinking while it still has months, a floor once it does not — fills
 * with what is actually in it.
 */
type Horizon =
  | { kind: "none" }
  | { kind: "period"; capCents: number }
  | { kind: "sinking"; targetCents: number }
  | { kind: "floor"; amountCents: number };

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
  return left !== null && left > 0
    ? { kind: "sinking", targetCents: target.amountCents }
    : { kind: "floor", amountCents: target.amountCents };
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
  // A refill's bar answers the ask's own question — is the month's cap assigned? A pile's
  // answers whether the pile is full.
  const askBar =
    horizon.kind === "period"
      ? barToward(funded, Math.max(periodTarget, 1), spent)
      : barToward(available, Math.max(periodTarget, 1), spent);

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

  if (asked && horizon.kind === "sinking" && funded < horizon.targetCents) {
    return {
      state: "on-track",
      moreNeededCents: 0,
      copy: "On Track",
      pill: "green",
      icon: "pie",
      bar: barToward(funded, horizon.targetCents, spent),
    };
  }

  if (asked) {
    const copy =
      spent > 0 && available > 0
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
