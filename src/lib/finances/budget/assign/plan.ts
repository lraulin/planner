/**
 * Plan an auto-assign run. The preview renders this result; the mutation writes it.
 *
 * **Assign never consumes more than Ready to Assign.** Reductions always apply first so
 * freed money can fund later increases. One envelope may be partial; later ones stay
 * unchanged. Leftover Ready to Assign stays in Ready to Assign.
 *
 * Demand math is the YNAB target engine (`targets/demand.ts`). The clamp, ranking, and
 * preview stay YNAB's Assign behaviour — named in `docs/actual-budget/README.md`.
 *
 * Spec: `agent-os/specs/2026-08-24-1311-budget-assign-options/` D1–D5, D9, as amended by
 * `agent-os/specs/2026-08-28-1000-ynab-target-engine/` D3–D6 and
 * `agent-os/specs/2026-08-28-2039-target-refill-basis/` D3.
 */

import { formatUsd } from "@/lib/finances/money";
import { monthName, prevMonthKey, type MonthKey } from "../envelope";
import { monthsLeft } from "../targets/cadence";
import { targetDemand } from "../targets/demand";
import type { BillSnapshot } from "../targets/derive";
import { assertCents, type Target } from "../targets/types";
import {
  ASSIGN_AVERAGE_MONTHS,
  ASSIGN_OPTION_LABELS,
  type AssignAllocation,
  type AssignEnvelope,
  type AssignError,
  type AssignHistoryMonth,
  type AssignLine,
  type AssignLineStatus,
  type AssignOption,
  type AssignResult,
} from "./types";

export type PlanAssignParams = {
  option: AssignOption;
  month: MonthKey;
  todayKey: string;
  readyToAssignCents: number;
  envelopes: readonly AssignEnvelope[];
  bills: ReadonlyMap<string, BillSnapshot>;
  history: readonly AssignHistoryMonth[];
  /** When set, only these ids. Hidden envelopes join only when listed here. */
  categoryIds?: readonly string[];
};

function onDay(todayKey: string): string {
  return `on ${monthName(todayKey)} ${Number(todayKey.slice(8, 10))}`;
}

function eligible(
  envelope: AssignEnvelope,
  categoryIds: readonly string[] | undefined,
): boolean {
  if (envelope.kind === "income") return false;
  if (envelope.status === "paused" || envelope.status === "cancelled") return false;
  if (categoryIds) return categoryIds.includes(envelope.id);
  return !envelope.hidden;
}

/**
 * Assigned that would bring Available to $0.
 * `balance = assigned + activity + carryIn`, so `assigned >= −activity − carryIn`.
 */
export function assignedToZeroBalance(envelope: AssignEnvelope): number {
  return Math.max(
    0,
    -assertCents(envelope.activityCents, "activity") -
      assertCents(envelope.carryInCents, "carry-in"),
  );
}

/**
 * An ask, as opposed to leftover Ready to Assign. A deadline-free floor counts: raiding one is
 * a real shortfall this month (`target-refill-basis` D3), it is only ranked below the rest.
 */
function hasUnderfundedAsk(envelope: AssignEnvelope): boolean {
  return envelope.kind === "bill" || envelope.target !== null;
}

/** A floor with no deadline — funded, but only after everything with a date on it. */
function isDeadlineFreeFloor(envelope: AssignEnvelope): boolean {
  return envelope.target?.cadence.unit === "none";
}

export function neededAssigned(
  envelope: AssignEnvelope,
  month: MonthKey,
  bills: ReadonlyMap<string, BillSnapshot>,
): { needed: number; errors: string[] } {
  const demand = hasUnderfundedAsk(envelope)
    ? targetDemand(envelope, month, bills)
    : { amount: 0, errors: [] as string[] };
  const needed = Math.max(demand.amount, assignedToZeroBalance(envelope));
  return { needed, errors: demand.errors };
}

function gapOf(envelope: AssignEnvelope, needed: number): number {
  return Math.max(0, needed - envelope.assignedCents);
}

/** Total remaining ask on the current month — the month-ahead note, not a gate. */
export function underfundedGapCents(
  month: MonthKey,
  envelopes: readonly AssignEnvelope[],
  bills: ReadonlyMap<string, BillSnapshot>,
): number {
  let gap = 0;
  for (const envelope of envelopes) {
    if (!eligible(envelope, undefined)) continue;
    gap += gapOf(envelope, neededAssigned(envelope, month, bills).needed);
  }
  return gap;
}

function sinkingCadence(target: Target | null): boolean {
  return target?.cadence.unit === "by" || target?.cadence.unit === "year";
}

/**
 * D4: overspend, then bills by due date, then sinking targets by deadline, then ordinary asks,
 * then deadline-free floors, then the rest.
 *
 * The floor bucket is last of the asks on purpose: a $100,000 down-payment floor would
 * otherwise drain Ready to Assign ahead of groceries (`target-refill-basis` D3).
 */
export function compareUnderfunded(
  left: AssignEnvelope,
  right: AssignEnvelope,
  month: MonthKey,
  indexOf: ReadonlyMap<string, number>,
): number {
  const bucket = (envelope: AssignEnvelope): number => {
    if (envelope.balanceCents < 0) return 0;
    if (envelope.kind === "bill") return 1;
    if (sinkingCadence(envelope.target)) return 2;
    if (isDeadlineFreeFloor(envelope)) return 4;
    if (hasUnderfundedAsk(envelope)) return 3;
    return 5;
  };
  const byBucket = bucket(left) - bucket(right);
  if (byBucket !== 0) return byBucket;

  const tie = bucket(left);
  if (tie === 0 || tie === 1) {
    const due = (envelope: AssignEnvelope) => envelope.nextDueKey ?? "9999-99-99";
    const byDue = due(left).localeCompare(due(right));
    if (byDue !== 0) return byDue;
  }
  if (tie === 2) {
    const soonest = (envelope: AssignEnvelope): number => {
      if (!envelope.target) return Number.POSITIVE_INFINITY;
      const remaining = monthsLeft(envelope.target.cadence, month);
      return remaining === null ? Number.POSITIVE_INFINITY : remaining;
    };
    const byTarget = soonest(left) - soonest(right);
    if (byTarget !== 0) return byTarget;
  }

  return (indexOf.get(left.id) ?? 0) - (indexOf.get(right.id) ?? 0);
}

function emptyResult(option: AssignOption, remainingRtaCents: number): AssignResult {
  return {
    option,
    lines: [],
    allocations: [],
    remainingRtaCents,
    listAmountCents: 0,
    partialCount: 0,
    skippedCount: 0,
    fullCount: 0,
    reducedCount: 0,
    shortfall: false,
    errors: [],
    note: "",
  };
}

function line(
  envelope: AssignEnvelope,
  toAssignedCents: number,
  status: AssignLineStatus,
): AssignLine {
  return {
    categoryId: envelope.id,
    name: envelope.name,
    fromAssignedCents: envelope.assignedCents,
    toAssignedCents,
    deltaCents: toAssignedCents - envelope.assignedCents,
    status,
  };
}

function counts(
  lines: readonly AssignLine[],
): Pick<AssignResult, "partialCount" | "skippedCount" | "fullCount" | "reducedCount"> {
  return {
    partialCount: lines.filter((entry) => entry.status === "partial").length,
    skippedCount: lines.filter((entry) => entry.status === "skipped").length,
    fullCount: lines.filter((entry) => entry.status === "full").length,
    reducedCount: lines.filter((entry) => entry.status === "reduced").length,
  };
}

function allocationsOf(
  lines: readonly AssignLine[],
  goals: ReadonlyMap<string, number>,
): AssignAllocation[] {
  return lines
    .filter((entry) => entry.deltaCents !== 0)
    .map((entry) => {
      const goalCents = goals.get(entry.categoryId);
      return goalCents === undefined
        ? { categoryId: entry.categoryId, amountCents: entry.toAssignedCents }
        : {
            categoryId: entry.categoryId,
            amountCents: entry.toAssignedCents,
            goalCents,
          };
    });
}

function noteOf(
  option: AssignOption,
  lines: readonly AssignLine[],
  todayKey: string,
): string {
  const moved = lines.filter((entry) => entry.deltaCents !== 0);
  if (moved.length === 0) return "";
  const names = moved.map((entry) => `${entry.name} ${formatUsd(entry.deltaCents)}`);
  return `${ASSIGN_OPTION_LABELS[option]}: ${names.join(", ")} ${onDay(todayKey)}`;
}

function finish(
  option: AssignOption,
  lines: AssignLine[],
  readyToAssignCents: number,
  listAmountCents: number,
  errors: AssignError[],
  todayKey: string,
  goals: ReadonlyMap<string, number> = new Map(),
): AssignResult {
  const tallies = counts(lines);
  const net = lines.reduce((sum, entry) => sum + entry.deltaCents, 0);
  return {
    option,
    lines,
    allocations: allocationsOf(lines, goals),
    remainingRtaCents: readyToAssignCents - net,
    listAmountCents,
    ...tallies,
    shortfall: tallies.partialCount > 0 || tallies.skippedCount > 0,
    errors,
    note: noteOf(option, lines, todayKey),
  };
}

function historyMonth(
  history: readonly AssignHistoryMonth[],
  month: MonthKey,
): AssignHistoryMonth | undefined {
  return history.find((entry) => entry.month === month);
}

function priorWindow(
  history: readonly AssignHistoryMonth[],
  month: MonthKey,
): AssignHistoryMonth[] {
  const index = history.findIndex((entry) => entry.month === month);
  if (index <= 0) return [];
  return history.slice(Math.max(0, index - ASSIGN_AVERAGE_MONTHS), index);
}

function averageOf(
  window: readonly AssignHistoryMonth[],
  categoryId: string,
  field: "assigned" | "activity",
): number | null {
  const first = window.findIndex((entry) => (entry[field][categoryId] ?? 0) !== 0);
  if (first === -1) return null;
  const active = window.slice(first);
  const total = active.reduce((sum, entry) => sum + (entry[field][categoryId] ?? 0), 0);
  if (field === "activity") {
    return Math.max(0, Math.round(-total / active.length));
  }
  return Math.max(0, Math.round(total / active.length));
}

function desiredAssigned(
  option: AssignOption,
  envelope: AssignEnvelope,
  month: MonthKey,
  history: readonly AssignHistoryMonth[],
  bills: ReadonlyMap<string, BillSnapshot>,
): { desired: number | null; errors: string[] } {
  switch (option) {
    case "assigned-last-month": {
      const previous = historyMonth(history, prevMonthKey(month));
      if (!previous) return { desired: null, errors: [] };
      return { desired: previous.assigned[envelope.id] ?? 0, errors: [] };
    }
    case "spent-last-month": {
      const previous = historyMonth(history, prevMonthKey(month));
      if (!previous) return { desired: null, errors: [] };
      return {
        desired: Math.max(0, -(previous.activity[envelope.id] ?? 0)),
        errors: [],
      };
    }
    case "average-assigned": {
      const window = priorWindow(history, month);
      const average = averageOf(window, envelope.id, "assigned");
      return { desired: average, errors: [] };
    }
    case "average-spent": {
      const window = priorWindow(history, month);
      const average = averageOf(window, envelope.id, "activity");
      return { desired: average, errors: [] };
    }
    case "reduce-overfunding": {
      if (!hasUnderfundedAsk(envelope)) return { desired: null, errors: [] };
      const { needed, errors } = neededAssigned(envelope, month, bills);
      if (envelope.assignedCents <= needed) return { desired: null, errors };
      return { desired: needed, errors };
    }
    case "reset-available": {
      // Assigned so balance is 0. May be negative.
      const desired =
        -assertCents(envelope.activityCents, "activity") -
        assertCents(envelope.carryInCents, "carry-in");
      if (desired === envelope.assignedCents) return { desired: null, errors: [] };
      return { desired, errors: [] };
    }
    case "reset-assigned": {
      if (envelope.assignedCents === 0) return { desired: null, errors: [] };
      return { desired: 0, errors: [] };
    }
    default:
      return { desired: null, errors: [] };
  }
}

/**
 * Apply reductions in full, then fund increases in Underfunded order until RTA runs out.
 */
function applyDesired(
  option: AssignOption,
  participants: readonly AssignEnvelope[],
  desiredOf: ReadonlyMap<string, number>,
  rta: number,
  todayKey: string,
  month: MonthKey,
  errors: AssignError[],
  listAmountCents: number,
): AssignResult {
  const indexOf = new Map(participants.map((envelope, index) => [envelope.id, index]));

  const reductions: AssignLine[] = [];
  let freed = 0;
  for (const envelope of participants) {
    const desired = desiredOf.get(envelope.id);
    if (desired === undefined || desired >= envelope.assignedCents) continue;
    reductions.push(line(envelope, desired, "reduced"));
    freed += envelope.assignedCents - desired;
  }

  let available = Math.max(0, rta) + freed;
  const increases = participants
    .filter((envelope) => {
      const desired = desiredOf.get(envelope.id);
      return desired !== undefined && desired > envelope.assignedCents;
    })
    .sort((left, right) => compareUnderfunded(left, right, month, indexOf));

  const increaseLines: AssignLine[] = [];
  for (const envelope of increases) {
    const desired = desiredOf.get(envelope.id)!;
    const want = desired - envelope.assignedCents;
    const given = Math.min(want, available);
    available -= given;
    const status: AssignLineStatus =
      given === want ? "full" : given > 0 ? "partial" : "skipped";
    increaseLines.push(line(envelope, envelope.assignedCents + given, status));
  }

  const lines = [...reductions, ...increaseLines];
  return finish(option, lines, rta, listAmountCents, errors, todayKey);
}

function planUnderfunded(
  params: PlanAssignParams,
  participants: AssignEnvelope[],
): AssignResult {
  const { month, bills, readyToAssignCents, todayKey } = params;
  const indexOf = new Map(participants.map((envelope, index) => [envelope.id, index]));
  const errors: AssignError[] = [];
  const neededById = new Map<string, number>();
  const goals = new Map<string, number>();

  for (const envelope of participants) {
    const { needed, errors: demandErrors } = neededAssigned(envelope, month, bills);
    neededById.set(envelope.id, needed);
    for (const message of demandErrors) {
      errors.push({
        categoryId: envelope.id,
        categoryName: envelope.name,
        message,
      });
    }
    if (hasUnderfundedAsk(envelope) || envelope.balanceCents < 0) {
      goals.set(envelope.id, needed);
    }
  }

  const demandEnvelopes = participants
    .filter((envelope) => gapOf(envelope, neededById.get(envelope.id) ?? 0) > 0)
    .sort((left, right) => compareUnderfunded(left, right, month, indexOf));

  const listAmountCents = demandEnvelopes.reduce(
    (sum, envelope) => sum + gapOf(envelope, neededById.get(envelope.id) ?? 0),
    0,
  );

  let available = Math.max(0, readyToAssignCents);
  const lines: AssignLine[] = [];
  for (const envelope of demandEnvelopes) {
    const needed = neededById.get(envelope.id) ?? 0;
    const want = gapOf(envelope, needed);
    const given = Math.min(want, available);
    available -= given;
    const status: AssignLineStatus =
      given === want ? "full" : given > 0 ? "partial" : "skipped";
    lines.push(line(envelope, envelope.assignedCents + given, status));
  }

  return finish(
    "underfunded",
    lines,
    readyToAssignCents,
    listAmountCents,
    errors,
    todayKey,
    goals,
  );
}

/**
 * Confirmation exists to show a shortfall or a multi-envelope split.
 * One envelope that can be fully funded is already the option the user picked —
 * the Auto list showed the amount.
 *
 * Spec: `agent-os/specs/2026-08-25-0831-assign-skip-full-single/` (supersedes
 * assign-options D6 for this case only).
 */
export function needsAssignPreview(result: AssignResult): boolean {
  if (result.shortfall) return true;
  if (result.allocations.length === 0) return true;
  if (result.lines.length !== 1) return true;
  return result.lines[0]?.status !== "full";
}

export function planAssign(params: PlanAssignParams): AssignResult {
  assertCents(params.readyToAssignCents, "ready to assign");
  const participants = params.envelopes.filter((envelope) =>
    eligible(envelope, params.categoryIds),
  );
  if (participants.length === 0) {
    return emptyResult(params.option, params.readyToAssignCents);
  }

  if (params.option === "underfunded") {
    return planUnderfunded(params, participants);
  }

  const errors: AssignError[] = [];
  const desiredOf = new Map<string, number>();
  let listIncreases = 0;
  let listDecreases = 0;
  for (const envelope of participants) {
    const { desired, errors: demandErrors } = desiredAssigned(
      params.option,
      envelope,
      params.month,
      params.history,
      params.bills,
    );
    for (const message of demandErrors) {
      errors.push({
        categoryId: envelope.id,
        categoryName: envelope.name,
        message,
      });
    }
    if (desired === null || desired === envelope.assignedCents) continue;
    desiredOf.set(envelope.id, desired);
    if (desired > envelope.assignedCents) {
      listIncreases += desired - envelope.assignedCents;
    } else {
      listDecreases += envelope.assignedCents - desired;
    }
  }

  const returnsMoney =
    params.option === "reduce-overfunding" ||
    params.option === "reset-available" ||
    params.option === "reset-assigned";
  const listAmountCents = returnsMoney ? listDecreases : listIncreases;

  return applyDesired(
    params.option,
    participants,
    desiredOf,
    params.readyToAssignCents,
    params.todayKey,
    params.month,
    errors,
    listAmountCents,
  );
}
