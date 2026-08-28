/**
 * Funding scan layer for one envelope: leftover can be positive and still be
 * underfunded.
 *
 * The ask is Assign's (`neededAssigned`). Copy, pill, icon and bar fractions are
 * derived from that gap plus the target horizon — they must not invent a
 * second demand.
 *
 * Spec: `agent-os/specs/2026-08-25-1310-budget-funding-indicators/` D3–D6, as
 * amended by `agent-os/specs/2026-08-28-1000-ynab-target-engine/` Task 8.
 */

import { formatUsd } from "@/lib/finances/money";
import type { MonthKey } from "./envelope";
import { neededAssigned } from "./assign/plan";
import type { AssignEnvelope } from "./assign/types";
import { monthsLeft, remainingOccurrences, scheduleSpreads } from "./targets/cadence";
import { availableBefore } from "./targets/demand";
import { resolveTarget, type BillSnapshot } from "./targets/derive";
import type { Target } from "./targets/types";

export type IndicatorState =
  "overspent" | "underfunded" | "fully-spent" | "on-track" | "funded" | "safe" | "idle";

export type IndicatorPill = "red" | "yellow" | "green" | "gray";
export type IndicatorIcon = "clock" | "check" | "pie";

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

type Horizon =
  | { kind: "none" }
  | { kind: "this-month"; periodTargetCents: number }
  | { kind: "sinking"; targetCents: number }
  | { kind: "eventually"; holeCents: number };

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

function occurrencePeriodTarget(
  target: Target,
  month: MonthKey,
  todayKey: string,
  bill: BillSnapshot | null,
): number {
  return (
    target.amountCents *
    remainingOccurrences(target.cadence, month, todayKey, bill ?? undefined)
  );
}

function horizonOf(
  envelope: AssignEnvelope,
  month: MonthKey,
  todayKey: string,
  bills: ReadonlyMap<string, BillSnapshot>,
): Horizon {
  if (isInactive(envelope) || envelope.kind === "income") return { kind: "none" };

  const resolved = resolveTarget(envelope, bills);
  const target = resolved.target;
  if (!target) return { kind: "none" };

  switch (target.cadence.unit) {
    case "week":
    case "month": {
      const periodTargetCents = occurrencePeriodTarget(
        target,
        month,
        todayKey,
        resolved.bill,
      );
      return periodTargetCents > 0
        ? { kind: "this-month", periodTargetCents }
        : { kind: "none" };
    }
    case "schedule": {
      if (resolved.bill && scheduleSpreads(resolved.bill)) {
        const left = monthsLeft(target.cadence, month, resolved.bill);
        if (left !== null && left > 0) {
          return {
            kind: "sinking",
            targetCents: target.amountCents,
          };
        }
      }
      const periodTargetCents = occurrencePeriodTarget(
        target,
        month,
        todayKey,
        resolved.bill,
      );
      return periodTargetCents > 0
        ? { kind: "this-month", periodTargetCents }
        : { kind: "none" };
    }
    case "year": {
      const left = monthsLeft(target.cadence, month);
      if (left === null || left <= 0) {
        return { kind: "this-month", periodTargetCents: target.amountCents };
      }
      return {
        kind: "sinking",
        targetCents: target.amountCents,
      };
    }
    case "by": {
      const left = monthsLeft(target.cadence, month);
      if (left === null) return { kind: "none" };
      if (left <= 0) {
        return { kind: "this-month", periodTargetCents: target.amountCents };
      }
      return {
        kind: "sinking",
        targetCents: target.amountCents,
      };
    }
    case "none":
      return {
        kind: "eventually",
        holeCents: Math.max(0, target.amountCents - availableBefore(envelope)),
      };
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
  todayKey: string,
  bills: ReadonlyMap<string, BillSnapshot>,
): EnvelopeIndicator {
  const available = envelope.balanceCents;
  const spent = spentCents(envelope);
  const funded = fundedCents(envelope);
  const { needed } = isInactive(envelope)
    ? { needed: 0 }
    : neededAssigned(envelope, month, todayKey, bills);
  const moreNeededCents = Math.max(0, needed - envelope.assignedCents);
  const horizon = horizonOf(envelope, month, todayKey, bills);
  const asked = horizon.kind !== "none" && horizon.kind !== "eventually";
  const periodTarget =
    horizon.kind === "sinking"
      ? horizon.targetCents
      : horizon.kind === "this-month"
        ? horizon.periodTargetCents
        : envelope.carryInCents + needed;
  const occurrenceBar =
    horizon.kind === "this-month"
      ? barToward(available, Math.max(periodTarget, 1), spent)
      : barToward(funded, Math.max(periodTarget, 1), spent);

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

  if (horizon.kind === "eventually" && horizon.holeCents > 0) {
    return {
      state: "safe",
      moreNeededCents: 0,
      copy: `${formatUsd(horizon.holeCents)} needed eventually`,
      pill: "green",
      icon: "check",
      bar: {
        fill01: 1,
        spent01: clamp01(spent / Math.max(funded, 1)),
        striped: false,
      },
    };
  }

  if (asked && moreNeededCents > 0) {
    return {
      state: "underfunded",
      moreNeededCents,
      copy: `${formatUsd(moreNeededCents)} more needed this month`,
      pill: "yellow",
      icon: "clock",
      bar: occurrenceBar,
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
  todayKey: string,
  envelopes: readonly AssignEnvelope[],
  bills: ReadonlyMap<string, BillSnapshot>,
): Map<string, EnvelopeIndicator> {
  const result = new Map<string, EnvelopeIndicator>();
  for (const envelope of envelopes) {
    if (envelope.kind === "income") continue;
    result.set(envelope.id, envelopeIndicator(envelope, month, todayKey, bills));
  }
  return result;
}
