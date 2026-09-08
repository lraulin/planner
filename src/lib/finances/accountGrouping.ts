import {
  compareGroupText,
  knownGroupBy,
  type AccountGroupBy,
  type GridGroupBy,
} from "@/lib/grid/grouping";
import { buildGroupRows, type GroupPart } from "@/lib/grid/groupRows";
import type { GridRow } from "@/lib/tree/slice";
import { accountKindLabel } from "./accountKind";
import type { OperationalAccount } from "./accountOperations";

/**
 * What the Accounts grid offers in the shared Group by picker.
 *
 * Every one of these is already a column (data-grid.md), so a header the user cannot
 * account for is impossible: the value that made the section can be shown, filtered and
 * sorted on beside it. Freshness is deliberately absent — its text carries a date
 * ("As of 9/4/2026 · refresh or import"), so grouping by it would make one section per
 * account.
 */
export const ACCOUNT_GROUP_BY_VALUES = [
  "kind",
  "source",
  "institution",
  "budget",
  "accountStatus",
] as const satisfies readonly GridGroupBy[];

export type { AccountGroupBy };

export function asAccountGroupBy(values: readonly string[]): AccountGroupBy[] {
  return knownGroupBy(values, ACCOUNT_GROUP_BY_VALUES);
}

const EMPTY_LABELS: Record<AccountGroupBy, string> = {
  kind: "(No Kind)",
  source: "(No Source)",
  institution: "(No Institution)",
  budget: "(No Budget)",
  accountStatus: "(No Status)",
};

function textPart(value: string): GroupPart | null {
  const label = value.trim();
  return label === "" ? null : { key: label, label, sort: label };
}

function partOf(
  account: OperationalAccount,
  dimension: AccountGroupBy,
): GroupPart | null {
  switch (dimension) {
    case "kind":
      return textPart(accountKindLabel(account.kind));
    case "source":
      // The balance source shown in the Source column — where this account's headline
      // number came from, which is what "why is this stale" turns on.
      return textPart(account.balanceSourceLabel);
    case "institution":
      return textPart(account.institution);
    case "budget":
      // Ranked rather than alphabetical, so the two-value dimensions order the way their
      // columns already sort. Alphabetical would put Off budget and Closed first, which
      // reads as the exception being the headline.
      return account.offBudget
        ? { key: "off", label: "Off budget", sort: 1 }
        : { key: "on", label: "On budget", sort: 0 };
    case "accountStatus":
      return account.closedAt
        ? { key: "closed", label: "Closed", sort: 1 }
        : { key: "open", label: "Open", sort: 0 };
  }
}

function comparePart(left: GroupPart, right: GroupPart): number {
  if (typeof left.sort === "number" && typeof right.sort === "number") {
    return left.sort - right.sort;
  }
  return compareGroupText(String(left.sort), String(right.sort));
}

function toGridRow(account: OperationalAccount): GridRow<OperationalAccount> {
  return { kind: "node", id: account.id, node: account, depth: 0 };
}

/**
 * Nest account rows under kind / source / institution / budget / status headers.
 *
 * Every dimension here is categorical, so sections run alphabetically by their label —
 * matching what the same column's sort would do — except the two yes/no dimensions, which
 * lead with the ordinary case. Accounts with no institution come last.
 */
export function groupAccounts(
  rows: readonly OperationalAccount[],
  dimensions: readonly string[],
): GridRow<OperationalAccount>[] {
  return buildGroupRows(rows, {
    dimensions: asAccountGroupBy(dimensions),
    partOf,
    emptyLabel: (dimension) => EMPTY_LABELS[dimension],
    comparePart,
    toGridRow,
  });
}

export type AccountTotals = {
  workingCents: number;
  postedCents: number;
  pendingCents: number;
};

/**
 * Sum the money columns of the accounts under one header, or of the whole grid.
 *
 * Legitimate here in a way it is not on the Register: Accounts holds every row locally, so
 * a sum of what it holds is a sum of the group (data-grid.md — whoever owns the pipeline
 * owns the totals).
 */
export function accountTotals(accounts: readonly OperationalAccount[]): AccountTotals {
  return accounts.reduce<AccountTotals>(
    (totals, account) => ({
      workingCents: totals.workingCents + account.workingCents,
      postedCents: totals.postedCents + account.postedCents,
      pendingCents: totals.pendingCents + account.pendingCents,
    }),
    { workingCents: 0, postedCents: 0, pendingCents: 0 },
  );
}
