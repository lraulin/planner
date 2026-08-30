/**
 * Every way money moves inside the budget, as pure clamped edits of one number.
 *
 * **Reimplemented from Actual Budget** — `packages/loot-core/src/server/budget/actions.ts`
 * (MIT, © James Long). The design choice worth copying is that Actual has no "transfer"
 * record: cover-overspending, move-money, assign-remaining, copy-last-month, N-month-average
 * and hold-for-next-month are all arithmetic on `(month, category, amount)` and on the
 * month's buffer. One table stays the whole ledger, and every affordance is a function that
 * can be tested without a database.
 *
 * **The clamps are the semantics, not defensive programming.** Covering more than the source
 * holds, or assigning more than Ready to Assign offers, would each produce a budget that is
 * arithmetically consistent and a lie about where the money is.
 *
 * Each operation returns absolute new amounts rather than deltas, so applying one twice is
 * the same as applying it once — the mutation layer is an upsert and needs no transaction to
 * be safe against a double-submitted click.
 *
 * Spec: `agent-os/specs/2026-08-22-1948-zero-based-budget/` D7.
 */

import { formatUsd } from "@/lib/finances/money";

import {
  categoryMonth,
  monthLabel,
  monthName,
  type BudgetMonth,
  type MonthKey,
} from "./envelope";

/** An envelope, named so the movement log can say which one. */
export type EnvelopeRef = {
  id: string;
  name: string;
};

export type AllocationWrite = {
  month: MonthKey;
  categoryId: string;
  /** The new assigned amount, absolute. */
  amountCents: number;
  /** Set only by Apply / Overwrite. Omitted writes leave the stored goal alone. */
  goalCents?: number | null;
};

export type BufferedWrite = {
  month: MonthKey;
  bufferedCents: number;
};

/**
 * What one operation changes, plus the line it adds to the month's log.
 *
 * A no-op returns `NO_EDIT` rather than throwing. Covering an envelope that is not overspent
 * is not an error the user needs told about — it is a menu item they can reach whenever the
 * row is on screen, and the honest response is to do nothing.
 */
export type BudgetEdit = {
  allocations: readonly AllocationWrite[];
  buffered: BufferedWrite | null;
  /** Empty when nothing changed. */
  note: string;
};

export const NO_EDIT: BudgetEdit = { allocations: [], buffered: null, note: "" };

/** `on August 22` — the day part of a movement line, without a year nobody reads. */
function onDay(todayKey: string): string {
  return `on ${monthName(todayKey)} ${Number(todayKey.slice(8, 10))}`;
}

function isNoop(edit: BudgetEdit): boolean {
  return edit.allocations.length === 0 && edit.buffered === null;
}

/**
 * Move a positive balance out of one envelope to cancel another's overspend.
 *
 * `coverable = min(|balance(to)|, balance(from))` — you cannot cover more than is owed, and
 * you cannot take more than is there. A source at or below zero covers nothing: that is the
 * difference between reallocating and creating a second hole.
 *
 * `from: null` means Ready to Assign, which is not an envelope and so is not debited — the
 * assignment itself is what consumes it. It is clamped at zero because a negative Ready to
 * Assign is already the problem and is not a source of funds.
 */
export function coverOverspending(params: {
  month: BudgetMonth;
  from: EnvelopeRef | null;
  to: EnvelopeRef;
  todayKey: string;
}): BudgetEdit {
  const { month, from, to, todayKey } = params;
  const target = categoryMonth(month, to.id);
  const owed = -target.balanceCents;
  if (owed <= 0) return NO_EDIT;

  if (!from) {
    const coverable = Math.min(owed, Math.max(0, month.readyToAssignCents));
    if (coverable <= 0) return NO_EDIT;
    return {
      allocations: [
        {
          month: month.month,
          categoryId: to.id,
          amountCents: target.assignedCents + coverable,
        },
      ],
      buffered: null,
      note: `Covered ${formatUsd(coverable)} of ${to.name} from Ready to Assign ${onDay(todayKey)}`,
    };
  }

  const source = categoryMonth(month, from.id);
  const coverable = Math.min(owed, source.balanceCents);
  if (coverable <= 0) return NO_EDIT;

  return {
    allocations: [
      {
        month: month.month,
        categoryId: from.id,
        amountCents: source.assignedCents - coverable,
      },
      {
        month: month.month,
        categoryId: to.id,
        amountCents: target.assignedCents + coverable,
      },
    ],
    buffered: null,
    note: `Covered ${formatUsd(coverable)} of ${to.name} from ${from.name} ${onDay(todayKey)}`,
  };
}

/**
 * Rule 3, made mechanical: take money out of one envelope and put it in another.
 *
 * Clamped to what the source actually holds. Actual's own move-money menu offers the balance
 * as the maximum, and letting the amount exceed it would turn one considered decision into
 * two envelopes to fix.
 */
export function transferBetweenCategories(params: {
  month: BudgetMonth;
  from: EnvelopeRef;
  to: EnvelopeRef;
  amountCents: number;
  todayKey: string;
}): BudgetEdit {
  const { month, from, to, amountCents, todayKey } = params;
  if (from.id === to.id) return NO_EDIT;

  const source = categoryMonth(month, from.id);
  const target = categoryMonth(month, to.id);
  const moved = Math.min(
    Math.max(0, Math.trunc(amountCents)),
    Math.max(0, source.balanceCents),
  );
  if (moved <= 0) return NO_EDIT;

  return {
    allocations: [
      {
        month: month.month,
        categoryId: from.id,
        amountCents: source.assignedCents - moved,
      },
      {
        month: month.month,
        categoryId: to.id,
        amountCents: target.assignedCents + moved,
      },
    ],
    buffered: null,
    note: `Reassigned ${formatUsd(moved)} from ${from.name} → ${to.name} ${onDay(todayKey)}`,
  };
}

/**
 * How much of `amountCents` can actually come out of an envelope's Available.
 *
 * Shared with the Fix This preview so the dialog cannot promise a different number than
 * the write. Clamped to `[0, max(0, available)]` — leftover/carry-in is Available, and
 * taking it may drive Assigned negative, which is valid.
 */
export function unassignMovedCents(
  amountCents: number,
  availableCents: number,
): number {
  return Math.min(Math.max(0, Math.trunc(amountCents)), Math.max(0, availableCents));
}

/**
 * The inverse of `assignFromReadyToAssign`: take Available out of an envelope and give it
 * back to Ready to Assign.
 *
 * Writes `assigned' = assigned − moved`. Assigned may go negative when the money is leftover
 * rather than this month's assignment — the same as YNAB, and the point of unassigning a
 * funded envelope that was filled last month. Available cannot go negative: `moved` is
 * clamped to it. Income never holds Available, so it is a no-op.
 *
 * Spec: `agent-os/specs/2026-08-29-2033-budget-fix-this/` D5.
 */
export function unassignToReadyToAssign(params: {
  month: BudgetMonth;
  from: EnvelopeRef;
  amountCents: number;
  todayKey: string;
}): BudgetEdit {
  const { month, from, amountCents, todayKey } = params;
  const source = categoryMonth(month, from.id);
  const moved = unassignMovedCents(amountCents, source.balanceCents);
  if (moved <= 0) return NO_EDIT;

  return {
    allocations: [
      {
        month: month.month,
        categoryId: from.id,
        amountCents: source.assignedCents - moved,
      },
    ],
    buffered: null,
    note: `Unassigned ${formatUsd(moved)} from ${from.name} to Ready to Assign ${onDay(todayKey)}`,
  };
}

/**
 * Give an envelope money from Ready to Assign.
 *
 * `amountCents: null` means all of it, which is the "Assign remaining" affordance. Clamped to
 * `[0, readyToAssign]`: this is the one rule zero-based budgeting has, so it is the one rule
 * the code refuses to bend.
 */
export function assignFromReadyToAssign(params: {
  month: BudgetMonth;
  to: EnvelopeRef;
  amountCents: number | null;
  todayKey: string;
}): BudgetEdit {
  const { month, to, amountCents, todayKey } = params;
  const available = Math.max(0, month.readyToAssignCents);
  const wanted =
    amountCents === null ? available : Math.max(0, Math.trunc(amountCents));
  const assigned = Math.min(wanted, available);
  if (assigned <= 0) return NO_EDIT;

  const target = categoryMonth(month, to.id);
  return {
    allocations: [
      {
        month: month.month,
        categoryId: to.id,
        amountCents: target.assignedCents + assigned,
      },
    ],
    buffered: null,
    note: `Assigned ${formatUsd(assigned)} to ${to.name} ${onDay(todayKey)}`,
  };
}

/** Set one envelope's assignment outright — the inline edit in the grid. */
export function setAssignment(params: {
  month: BudgetMonth;
  category: EnvelopeRef;
  amountCents: number;
  todayKey: string;
}): BudgetEdit {
  const { month, category, amountCents, todayKey } = params;
  const current = categoryMonth(month, category.id);
  const next = Math.trunc(amountCents);
  if (next === current.assignedCents) return NO_EDIT;

  const delta = next - current.assignedCents;
  const verb = delta > 0 ? "Assigned" : "Removed";
  return {
    allocations: [{ month: month.month, categoryId: category.id, amountCents: next }],
    buffered: null,
    note: `${verb} ${formatUsd(Math.abs(delta))} ${
      delta > 0 ? "to" : "from"
    } ${category.name} ${onDay(todayKey)}`,
  };
}

/**
 * Leftover Actual Hold. The product no longer creates holds
 * (`agent-os/specs/2026-08-25-1154-month-ahead-zero-based/` D2); Release still uses this
 * so a leftover `bufferedCents` can be given back. A deferral, not a sink.
 */
export function holdForNextMonth(params: {
  month: BudgetMonth;
  amountCents: number;
  todayKey: string;
}): BudgetEdit {
  const { month, amountCents, todayKey } = params;
  const requested = Math.trunc(amountCents);
  const ceiling = Math.max(0, month.readyToAssignCents);
  const delta = Math.min(Math.max(requested, -month.bufferedCents), ceiling);
  if (delta === 0) return NO_EDIT;

  const next = month.bufferedCents + delta;
  return {
    allocations: [],
    buffered: { month: month.month, bufferedCents: next },
    note:
      delta > 0
        ? `Held ${formatUsd(delta)} for next month ${onDay(todayKey)}`
        : `Released ${formatUsd(-delta)} back to Ready to Assign ${onDay(todayKey)}`,
  };
}

/** Give it all back. */
export function releaseHold(params: {
  month: BudgetMonth;
  todayKey: string;
}): BudgetEdit {
  return holdForNextMonth({
    month: params.month,
    amountCents: -params.month.bufferedCents,
    todayKey: params.todayKey,
  });
}

/**
 * Start this month from last month's assignments.
 *
 * The fastest honest way to fill a fresh month: last month's plan is the best guess at this
 * month's, and every figure it copies is one the user chose rather than one derived from a
 * window they did not pick. Income envelopes are skipped — they are never assigned.
 */
export function copyPreviousMonth(params: {
  month: BudgetMonth;
  previous: BudgetMonth | null;
  categories: readonly EnvelopeRef[];
  todayKey: string;
}): BudgetEdit {
  const { month, previous, categories, todayKey } = params;
  if (!previous) return NO_EDIT;

  const allocations: AllocationWrite[] = [];
  for (const category of categories) {
    const before = categoryMonth(previous, category.id).assignedCents;
    if (before !== categoryMonth(month, category.id).assignedCents) {
      allocations.push({
        month: month.month,
        categoryId: category.id,
        amountCents: before,
      });
    }
  }
  if (allocations.length === 0) return NO_EDIT;

  return {
    allocations,
    buffered: null,
    note: `Copied ${monthLabel(previous.month)} assignments ${onDay(todayKey)}`,
  };
}

/**
 * Budget what this envelope has actually cost, averaged over the last `lookback` months.
 *
 * The window **starts at the envelope's first month with activity**, as Actual's does, so a
 * category created two months ago is not averaged against four months of zeroes and told to
 * budget half of what it really costs. An envelope with no history averages to nothing rather
 * than guessing.
 *
 * Clamped at zero: net refunds would otherwise make "set to average" propose a negative
 * assignment, which is a coherent thing to store and an incoherent thing for that button to
 * mean.
 */
export function setToAverage(params: {
  months: readonly BudgetMonth[];
  month: MonthKey;
  lookback: number;
  categories: readonly EnvelopeRef[];
  todayKey: string;
}): BudgetEdit {
  const { months, month, lookback, categories, todayKey } = params;
  const target = months.find((entry) => entry.month === month);
  if (!target || lookback <= 0) return NO_EDIT;

  const index = months.indexOf(target);
  const window = months.slice(Math.max(0, index - lookback), index);
  if (window.length === 0) return NO_EDIT;

  const allocations: AllocationWrite[] = [];
  for (const category of categories) {
    const firstActive = window.findIndex(
      (entry) => categoryMonth(entry, category.id).activityCents !== 0,
    );
    if (firstActive === -1) continue;

    const active = window.slice(firstActive);
    const spent = active.reduce(
      (total, entry) => total + categoryMonth(entry, category.id).activityCents,
      0,
    );
    const average = Math.max(0, Math.round(-spent / active.length));
    if (average !== categoryMonth(target, category.id).assignedCents) {
      allocations.push({ month, categoryId: category.id, amountCents: average });
    }
  }
  if (allocations.length === 0) return NO_EDIT;

  return {
    allocations,
    buffered: null,
    note: `Set assignments to the ${lookback}-month average ${onDay(todayKey)}`,
  };
}

/** Clear the month and start again. Income envelopes are never assigned, so never cleared. */
export function setZero(params: {
  month: BudgetMonth;
  categories: readonly EnvelopeRef[];
  todayKey: string;
}): BudgetEdit {
  const { month, categories, todayKey } = params;
  const allocations = categories
    .filter((category) => categoryMonth(month, category.id).assignedCents !== 0)
    .map((category) => ({
      month: month.month,
      categoryId: category.id,
      amountCents: 0,
    }));
  if (allocations.length === 0) return NO_EDIT;

  return {
    allocations,
    buffered: null,
    note: `Cleared every assignment ${onDay(todayKey)}`,
  };
}

/** True when an edit would write nothing, so callers can skip the round trip. */
export function isEmptyEdit(edit: BudgetEdit): boolean {
  return isNoop(edit);
}
