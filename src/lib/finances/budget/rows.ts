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
import type { BillFacet, BudgetCategoryRow, BudgetGroupRow } from "./queries";
import { nestedBudgetGridRows } from "./hierarchy";
import type { EnvelopeKind } from "@/db/schema";

export type BudgetRow = {
  id: string;
  groupId: string | null;
  sortKey: string;
  name: string;
  isIncome: boolean;
  hidden: boolean;
  notes: string;
  assignedCents: number;
  activityCents: number;
  balanceCents: number;
  /** The flag stored on this month, which governs the hand-off to the next one. */
  carryover: boolean;
  templates: BudgetCategoryRow["templates"];
  /** Template goal for this month; null when Apply has not written one. */
  goalCents: number | null;
  kind: EnvelopeKind;
  /** The bill facet — cadence, status, url — meaningful only when `kind === "bill"`. */
  bill: BillFacet | null;
  /**
   * Next charge, derived from charge history via `billAnchor` — null for a bill with no
   * charge yet, or an ordinary envelope. Computed by the caller (`loadBillSnapshots`) rather
   * than here, since it needs a database read this pure module cannot make.
   */
  nextDueKey: string | null;
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
  nextDueKeys: ReadonlyMap<string, string> = new Map(),
): BudgetRow[] {
  const order = new Map(groups.map((group, index) => [group.id, index]));

  return [...categories]
    .sort((left, right) => {
      const byGroup =
        (order.get(left.groupId ?? "") ?? -1) - (order.get(right.groupId ?? "") ?? -1);
      return byGroup !== 0 ? byGroup : compareSortKeys(left.sortKey, right.sortKey);
    })
    .map((category) => {
      const cell = categoryMonth(month, category.id);
      return {
        id: category.id,
        groupId: category.groupId,
        sortKey: category.sortKey,
        name: category.name,
        isIncome: category.kind === "income",
        hidden: category.hidden,
        notes: category.notes,
        templates: category.templates,
        goalCents: goals[`${month.month}|${category.id}`] ?? null,
        assignedCents: cell.assignedCents,
        activityCents: cell.activityCents,
        balanceCents: cell.balanceCents,
        carryover: cell.carryover,
        kind: category.kind,
        bill: category.bill,
        nextDueKey: nextDueKeys.get(category.id) ?? null,
      };
    });
}

/**
 * Group headers interleaved with their envelopes, as the shared grid wants them.
 *
 * `showHidden` keeps a retired envelope on screen so it can be un-hidden or deleted; without
 * it the only way back would be a database.
 */
export function budgetGridRows<T extends BudgetRow>(
  groups: readonly BudgetGroupRow[],
  rows: readonly T[],
  options: { showHidden: boolean } = { showHidden: false },
): GridRow<T>[] {
  return sectionGridRows(groups, rows, options);
}

/**
 * A bill row, narrowed so the bill columns need no null branch.
 *
 * The Bills table only ever holds `kind: "bill"` rows, so `bill` is present by construction.
 * Proving that once here is what lets `billColumns` render a cadence or a status outright
 * instead of every cell carrying a `— if this is not really a bill` fallback.
 */
export type BudgetBillRow = BudgetRow & { bill: NonNullable<BudgetRow["bill"]> };

export function isBillRow(row: BudgetRow): row is BudgetBillRow {
  return row.kind === "bill" && row.bill !== null;
}

/**
 * The page section an envelope lives in.
 *
 * Bills sit inside Spending: they have their own table, but "All spending" is bills +
 * regular, and Savings is held out of that total
 * (`agent-os/specs/2026-08-24-0930-envelope-sections/` D3).
 */
export function pageSectionOf(kind: EnvelopeKind): "income" | "spending" | "savings" {
  if (kind === "income") return "income";
  if (kind === "savings") return "savings";
  return "spending";
}

/**
 * The four sections the Budget page renders, from one folded row set.
 *
 * Bills and ordinary envelopes are separate **tables** rather than one grid with `—` in the
 * bill columns: only a bill has a cadence, a status or a URL, and a column that is blank on
 * two thirds of its rows is a column that costs width without answering anything. They stay
 * one **budget** — `budgetTotals` sums bills + regular as "All spending", and Savings is
 * totalled separately so a house fund is not an overspend.
 */
export function budgetSections(rows: readonly BudgetRow[]): {
  income: BudgetRow[];
  bills: BudgetBillRow[];
  envelopes: BudgetRow[];
  savings: BudgetRow[];
} {
  return {
    income: rows.filter((row) => row.kind === "income"),
    bills: rows.filter((row): row is BudgetBillRow => isBillRow(row)),
    envelopes: rows.filter((row) => row.kind === "spending"),
    savings: rows.filter((row) => row.kind === "savings"),
  };
}

/**
 * One section's grid rows, with a lone top-level group header dropped.
 *
 * When every row in a section sits under the same root group, that header repeats what the
 * section is already called — two "Spending" headers on one page, one above the bills and one
 * above the envelopes. Deeper nesting still renders, because then the headers are the only
 * thing saying which envelope belongs to what.
 */
export function sectionGridRows<T extends BudgetRow>(
  groups: readonly BudgetGroupRow[],
  rows: readonly T[],
  options: { showHidden: boolean } = { showHidden: false },
): GridRow<T>[] {
  const result = nestedBudgetGridRows(groups, rows, rows, options);
  const headers = result.filter((row) => row.kind === "group");
  if (headers.length !== 1 || headers[0]?.depth !== 0) return result;
  return result
    .filter((row) => row.kind !== "group")
    .map((row) => ({ ...row, depth: Math.max(0, row.depth - 1) }));
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
