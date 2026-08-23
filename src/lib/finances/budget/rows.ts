/**
 * The Budget grid's rows and totals, derived without React.
 *
 * Envelope rows carry all money facts. Group membership is derived here and the grid folds
 * those same rows recursively, so a collapsed total and its expanded descendants cannot
 * come from two different sources — the failure
 * `2026-08-18-2058-commitments-clarity` was written about.
 */

import type { GridRow } from "@/lib/tree/slice";
import { compare as compareSortKeys } from "@/lib/tree/sortKey";

import { categoryMonth, type BudgetMonth } from "./envelope";
import type { BudgetCategoryRow, BudgetGroupRow } from "./queries";
import { nestedBudgetGridRows } from "./hierarchy";

export type BudgetRow = {
  id: string;
  groupId: string;
  sortKey: string;
  name: string;
  isIncome: boolean;
  hidden: boolean;
  notes: string;
  sourceCategories: readonly string[];
  assignedCents: number;
  activityCents: number;
  balanceCents: number;
  /** The flag stored on this month, which governs the hand-off to the next one. */
  carryover: boolean;
  templates: BudgetCategoryRow["templates"];
  /** Template goal for this month; null when Apply has not written one. */
  goalCents: number | null;
};

export type BudgetTotals = {
  assignedCents: number;
  activityCents: number;
  balanceCents: number;
};

export function budgetTotals(rows: readonly BudgetRow[]): BudgetTotals {
  return rows.reduce<BudgetTotals>(
    (total, row) => ({
      assignedCents: total.assignedCents + row.assignedCents,
      activityCents: total.activityCents + row.activityCents,
      balanceCents: total.balanceCents + row.balanceCents,
    }),
    { assignedCents: 0, activityCents: 0, balanceCents: 0 },
  );
}

/**
 * One row per envelope, in group order, with the month's numbers attached.
 *
 * Hidden envelopes are dropped from the grid but **not** from the totals the caller builds
 * from `budgetTotals` over the unfiltered list — hiding is a way to tidy the screen, and a
 * budget whose parts stopped summing to its whole because something was tidied away would be
 * worse than the clutter. Actual's envelope mode makes the same choice.
 */
export function budgetRows(
  groups: readonly BudgetGroupRow[],
  categories: readonly BudgetCategoryRow[],
  month: BudgetMonth,
  goals: Readonly<Record<string, number>> = {},
): BudgetRow[] {
  const incomeGroups = new Set(
    groups.filter((group) => group.isIncome).map((group) => group.id),
  );
  const order = new Map(groups.map((group, index) => [group.id, index]));

  return [...categories]
    .sort((left, right) => {
      const byGroup = (order.get(left.groupId) ?? 0) - (order.get(right.groupId) ?? 0);
      return byGroup !== 0 ? byGroup : compareSortKeys(left.sortKey, right.sortKey);
    })
    .map((category) => {
      const cell = categoryMonth(month, category.id);
      return {
        id: category.id,
        groupId: category.groupId,
        sortKey: category.sortKey,
        name: category.name,
        isIncome: incomeGroups.has(category.groupId),
        hidden: category.hidden,
        notes: category.notes,
        sourceCategories: category.sourceCategories,
        templates: category.templates,
        goalCents: goals[`${month.month}|${category.id}`] ?? null,
        assignedCents: cell.assignedCents,
        activityCents: cell.activityCents,
        balanceCents: cell.balanceCents,
        carryover: cell.carryover,
      };
    });
}

/**
 * Group headers interleaved with their envelopes, as the shared grid wants them.
 *
 * `showHidden` keeps a retired envelope on screen so it can be un-hidden or deleted; without
 * it the only way back would be a database.
 */
export function budgetGridRows(
  groups: readonly BudgetGroupRow[],
  rows: readonly BudgetRow[],
  options: { showHidden: boolean } = { showHidden: false },
): GridRow<BudgetRow>[] {
  return nestedBudgetGridRows(groups, rows, rows, options);
}

/**
 * How a balance should read: funded, spent to nothing, or short.
 *
 * Named rather than inlined as a ternary on a colour, because "overspent" is the state the
 * whole page exists to make actionable and three places need to agree on what counts as it.
 */
export type BalanceTone = "positive" | "zero" | "negative";

export function balanceTone(cents: number): BalanceTone {
  if (cents > 0) return "positive";
  if (cents < 0) return "negative";
  return "zero";
}

/** Assigned vs the last-applied template goal. No goal → no colour. */
export type GoalTone = "met" | "unmet" | null;

export function goalTone(assignedCents: number, goalCents: number | null): GoalTone {
  if (goalCents === null) return null;
  return assignedCents >= goalCents ? "met" : "unmet";
}

/** Envelopes with money in them, for the "cover from…" picker. Never offers the target. */
export function coverSources(
  rows: readonly BudgetRow[],
  targetId: string,
): BudgetRow[] {
  return rows.filter(
    (row) => row.id !== targetId && !row.isIncome && row.balanceCents > 0,
  );
}

/** Envelopes that could receive money, for the "move to…" picker. */
export function moveTargets(rows: readonly BudgetRow[], sourceId: string): BudgetRow[] {
  return rows.filter((row) => row.id !== sourceId && !row.isIncome);
}

/** Envelopes that are overspent this month, worst first — the page's work list. */
export function overspentRows(rows: readonly BudgetRow[]): BudgetRow[] {
  return rows
    .filter((row) => !row.isIncome && row.balanceCents < 0)
    .sort((left, right) => left.balanceCents - right.balanceCents);
}
