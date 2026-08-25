/**
 * Funding scan layer for one envelope: leftover can be positive and still be
 * underfunded.
 *
 * The ask is Assign's (`neededAssigned`). Copy, pill, icon and bar fractions are
 * derived from that gap plus the template/bill horizon — they must not invent a
 * second demand.
 *
 * Spec: `agent-os/specs/2026-08-25-1310-budget-funding-indicators/` D3–D6.
 */

import { formatUsd } from "@/lib/finances/money";
import { cadenceOf } from "@/lib/finances/recurringBills";
import { monthLabel, monthName, shiftMonthKey, type MonthKey } from "./envelope";
import { neededAssigned } from "./assign/plan";
import type { AssignEnvelope } from "./assign/types";
import { monthsUntilBy, runBy } from "./templates/by";
import { bys, simples } from "./templates/demand";
import { monthsUntilDate } from "./templates/monthSpan";
import type { BillSnapshot } from "./templates/schedule";

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
  | { kind: "this-month" }
  | { kind: "sinking"; targetCents: number; byLabel: string };

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

function dueDayLabel(dateKey: string): string {
  return `${monthName(dateKey)} ${Number(dateKey.slice(8, 10))}`;
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

  const byTemplates = bys(envelope.templates);
  if (byTemplates.length > 0) {
    const { totalNeeded, numMonths } = runBy(byTemplates, month, envelope.carryInCents);
    if (totalNeeded <= 0) return { kind: "none" };
    if (numMonths <= 0) return { kind: "this-month" };
    const shortest = byTemplates
      .map((template) => monthsUntilBy(template, month))
      .filter((value): value is number => value != null && value > 0)
      .sort((left, right) => left - right)[0];
    if (shortest === undefined) return { kind: "this-month" };
    return {
      kind: "sinking",
      targetCents: totalNeeded,
      byLabel: monthLabel(shiftMonthKey(month, shortest)),
    };
  }

  if (simples(envelope.templates).length > 0) return { kind: "this-month" };

  if (envelope.kind !== "bill") return { kind: "none" };
  const snapshot = bills.get(envelope.id);
  if (!snapshot) return { kind: "none" };
  const cadence = cadenceOf({
    cadenceMonths: snapshot.cadenceMonths,
    cadenceDays: snapshot.cadenceDays,
  });
  if (cadence.unit === "day") return { kind: "this-month" };
  if (cadence.n === 1) {
    return monthsUntilDate(month, snapshot.nextDueKey) === 0
      ? { kind: "this-month" }
      : { kind: "none" };
  }
  const monthsLeft = Math.max(0, monthsUntilDate(month, snapshot.nextDueKey));
  if (monthsLeft <= 0) return { kind: "this-month" };
  return {
    kind: "sinking",
    targetCents: snapshot.expectedCents,
    byLabel: dueDayLabel(snapshot.nextDueKey),
  };
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
    horizon.kind === "sinking" ? horizon.targetCents : envelope.carryInCents + needed;

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

  if (asked && moreNeededCents > 0) {
    const copy =
      horizon.kind === "sinking"
        ? `${formatUsd(moreNeededCents)} more needed by ${horizon.byLabel}`
        : `${formatUsd(moreNeededCents)} more needed this month`;
    return {
      state: "underfunded",
      moreNeededCents,
      copy,
      pill: "yellow",
      icon: "clock",
      bar: barToward(funded, Math.max(periodTarget, 1), spent),
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
