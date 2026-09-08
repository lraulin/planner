import { compareGroupText, knownGroupBy, type GridGroupBy } from "@/lib/grid/grouping";
import { buildGroupRows, type GroupPart } from "@/lib/grid/groupRows";
import type { GridRow } from "@/lib/tree/slice";
import { transactionDatePart } from "./grouping";
import type { StatementViewRow } from "./types";

export const STATEMENT_GROUP_BY_VALUES = [
  "account",
  "year",
  "month",
] as const satisfies readonly GridGroupBy[];

export type StatementGroupBy = (typeof STATEMENT_GROUP_BY_VALUES)[number];

export function asStatementGroupBy(values: readonly string[]): StatementGroupBy[] {
  return knownGroupBy(values, STATEMENT_GROUP_BY_VALUES);
}

const EMPTY: Record<StatementGroupBy, string> = {
  account: "(No Account)",
  year: "(No Year)",
  month: "(No Month)",
};

function partOf(row: StatementViewRow, dimension: StatementGroupBy): GroupPart | null {
  if (dimension === "account") {
    const name = row.accountName.trim();
    return name === "" ? null : { key: name, label: name, sort: name };
  }
  const part = transactionDatePart(row.periodEnd, dimension);
  return part && { key: part.key, label: part.label, sort: part.rank };
}

function toGridRow(row: StatementViewRow): GridRow<StatementViewRow> {
  return { kind: "node", id: row.id, node: row, depth: 0 };
}

/**
 * Nest statements under account / year / month headers.
 *
 * Accounts run A–Z; calendar dimensions run newest first, matching the register. Within a
 * group the newest period end leads, whatever the grid's own sort — a statement list read
 * any other way is a list of numbers with no story.
 */
export function groupStatements(
  rows: readonly StatementViewRow[],
  dimensions: readonly string[],
): GridRow<StatementViewRow>[] {
  return buildGroupRows(rows, {
    dimensions: asStatementGroupBy(dimensions),
    partOf,
    emptyLabel: (dimension) => EMPTY[dimension],
    comparePart: (left, right, dimension) => {
      if (typeof left.sort === "number" && typeof right.sort === "number") {
        return dimension === "account"
          ? left.sort - right.sort
          : right.sort - left.sort;
      }
      // The same comparator the register uses, so one account name cannot sort one way
      // on this grid and another way on the one beside it.
      const compared = compareGroupText(String(left.sort), String(right.sort));
      return dimension === "account" ? compared : -compared;
    },
    toGridRow,
    tiebreak: (left, right) => right.periodEnd.localeCompare(left.periodEnd),
  });
}
