/**
 * Apply / overwrite targets against one month, as a pure function.
 *
 * Demand envelopes write absolute Assigned amounts and may drive Ready to Assign negative.
 * Remainder is gone — leftover Ready to Assign stays in Ready to Assign
 * (`agent-os/specs/2026-08-28-1000-ynab-target-engine/` D6).
 *
 * **A bill envelope participates even with no stored target**: its cadence seeds a derived
 * one (`targets/derive.ts`). An ordinary envelope with no target is skipped.
 *
 * Spec: `agent-os/specs/2026-08-28-1000-ynab-target-engine/` Task 7.
 */

import type { EnvelopeKind } from "@/db/schema";
import { formatUsd } from "@/lib/finances/money";
import { monthName, type MonthKey } from "../envelope";
import { targetDemand } from "../targets/demand";
import { hasTargetAsk, type BillSnapshot } from "../targets/derive";
import { assertCents, type Target } from "../targets/types";

export type EnvelopeApplyInput = {
  id: string;
  name: string;
  isIncome: boolean;
  kind: EnvelopeKind;
  target: Target | null;
  assignedCents: number;
  /** Carry-in into this month: previous balance if carryover, else max(0, previous). */
  carryInCents: number;
  activityCents: number;
};

export type ApplyOptions = {
  month: MonthKey;
  envelopes: readonly EnvelopeApplyInput[];
  bills: ReadonlyMap<string, BillSnapshot>;
  readyToAssignCents: number;
  /** Overwrite: replace Assigned on every targeted envelope. Apply: only empty cells. */
  force: boolean;
  /** When set, only these envelopes (still honouring force / income / empty). */
  categoryIds?: readonly string[];
  todayKey: string;
};

export type ApplyAllocation = {
  categoryId: string;
  amountCents: number;
  goalCents: number;
};

export type ApplyError = {
  categoryId: string;
  categoryName: string;
  message: string;
};

export type ApplyResult = {
  allocations: ApplyAllocation[];
  errors: ApplyError[];
  note: string;
};

function onDay(todayKey: string): string {
  return `on ${monthName(todayKey)} ${Number(todayKey.slice(8, 10))}`;
}

function selected(envelope: EnvelopeApplyInput, options: ApplyOptions): boolean {
  if (envelope.isIncome) return false;
  if (!hasTargetAsk(envelope)) return false;
  if (options.categoryIds && !options.categoryIds.includes(envelope.id)) return false;
  if (!options.force && envelope.assignedCents !== 0) return false;
  return true;
}

export function applyTemplates(options: ApplyOptions): ApplyResult {
  assertCents(options.readyToAssignCents, "ready to assign");
  const participants = options.envelopes.filter((envelope) =>
    selected(envelope, options),
  );
  if (participants.length === 0) {
    return { allocations: [], errors: [], note: "" };
  }

  const allocations: ApplyAllocation[] = [];
  const errors: ApplyError[] = [];
  const names: string[] = [];

  for (const envelope of participants) {
    const ran = targetDemand(envelope, options.month, options.todayKey, options.bills);
    for (const message of ran.errors) {
      errors.push({ categoryId: envelope.id, categoryName: envelope.name, message });
    }
    // A deadline-free floor is reported, never funded.
    if (ran.eventuallyCents !== null) continue;
    allocations.push({
      categoryId: envelope.id,
      amountCents: ran.amount,
      goalCents: ran.amount,
    });
    names.push(`${envelope.name} ${formatUsd(ran.amount)}`);
  }

  const verb = options.force ? "Overwrote with targets" : "Applied targets";
  const note =
    allocations.length === 0
      ? ""
      : `${verb}: ${names.join(", ")} ${onDay(options.todayKey)}`;

  return { allocations, errors, note };
}

/** Carry-in Actual feeds demand: negative without carryover counts as 0. */
export function templateCarryIn(
  previous: {
    balanceCents: number;
    carryover: boolean;
  } | null,
): number {
  if (!previous) return 0;
  if (previous.balanceCents < 0 && !previous.carryover) return 0;
  return previous.balanceCents;
}
