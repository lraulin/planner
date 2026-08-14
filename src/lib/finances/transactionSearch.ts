/**
 * Filter Insights rows in JS, using the same effective values the dashboard uses.
 *
 * Restating these predicates in SQL is how the agent and the register start
 * disagreeing: `flow` is `coalesce(flow_override, derived_flow, sign-fallback)`,
 * category has the same stack, and spend/income are not `amount < 0`.
 */

import {
  effectiveCategory,
  effectiveFlow,
  incomeCentsOf,
  spendCentsOf,
  type AnalyticsRow,
} from "./analytics";
import type { FinanceFlowKind } from "@/db/schema";

export type TransactionSearchFilter = {
  query?: string;
  from?: string;
  to?: string;
  accountId?: string;
  category?: string;
  flow?: FinanceFlowKind;
  direction?: "income" | "spend" | "any";
  /** Inclusive bound on `abs(amountCents)`. */
  minCents?: number;
  /** Inclusive bound on `abs(amountCents)`. */
  maxCents?: number;
};

export type TransactionSearchResult = {
  rows: AnalyticsRow[];
  matchedIncomeCents: number;
  matchedSpendCents: number;
  matchedNetCents: number;
};

export function searchTransactions(
  rows: readonly AnalyticsRow[],
  filter: TransactionSearchFilter = {},
): TransactionSearchResult {
  const needle = filter.query?.trim().toLowerCase();
  const matched: AnalyticsRow[] = [];
  let matchedIncomeCents = 0;
  let matchedSpendCents = 0;

  for (const row of rows) {
    if (needle && !row.description.toLowerCase().includes(needle)) continue;
    if (filter.from && row.transactionDate < filter.from) continue;
    if (filter.to && row.transactionDate > filter.to) continue;
    if (filter.accountId && row.accountId !== filter.accountId) continue;
    if (filter.category && effectiveCategory(row) !== filter.category) continue;
    if (filter.flow && effectiveFlow(row) !== filter.flow) continue;
    if (filter.direction === "income" && incomeCentsOf(row) <= 0) continue;
    if (filter.direction === "spend" && spendCentsOf(row) === 0) continue;
    const magnitude = Math.abs(row.amountCents);
    if (filter.minCents !== undefined && magnitude < filter.minCents) continue;
    if (filter.maxCents !== undefined && magnitude > filter.maxCents) continue;

    matched.push(row);
    matchedIncomeCents += incomeCentsOf(row);
    matchedSpendCents += spendCentsOf(row);
  }

  return {
    rows: matched,
    matchedIncomeCents,
    matchedSpendCents,
    matchedNetCents: matchedIncomeCents - matchedSpendCents,
  };
}
