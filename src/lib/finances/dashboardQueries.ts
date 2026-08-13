import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  financeAccounts,
  financeStatementRates,
  financeStatements,
  financeTransactions,
} from "@/db/schema";
import type { AnalyticsRow } from "./analytics";
import { numericStringToCents } from "./money";

/**
 * Reads for the insights dashboard. Every one takes `userId` and scopes on it.
 *
 * **Why this loads rows instead of aggregating in SQL.** The register's totals are summed in
 * the database, and they should be: one number over an unbounded table. The dashboard is the
 * opposite shape — a dozen panels that each re-slice the *same* three years of rows by month,
 * by pay period, by category, by merchant and by flow. As one `GROUP BY` per panel that is a
 * dozen round trips and a dozen places for the flow rules to be restated slightly
 * differently; as one read plus `analytics.ts` it is a single query and one implementation of
 * each rule, unit-tested without a database.
 *
 * The arithmetic stays exact because it stays in integer cents — the same reason the importer
 * parses to cents at the edge. Three thousand rows is a few hundred kilobytes; if this ever
 * outgrows that, the fix is the date window this already takes, not a scattering of `sum()`.
 */

export type InsightsFilter = {
  /** Inclusive `YYYY-MM-DD` bounds. Omitted means the whole history, which is the default
   * the page wants: a trailing-12 average needs the twelve months before the window. */
  from?: string;
  to?: string;
};

function scopeConditions(userId: string, filter: InsightsFilter) {
  const conditions = [eq(financeTransactions.userId, userId)];
  if (filter.from) {
    conditions.push(gte(financeTransactions.transactionDate, filter.from));
  }
  if (filter.to) conditions.push(lte(financeTransactions.transactionDate, filter.to));
  return conditions;
}

/** Every classified transaction, oldest first — the one read the whole dashboard runs on. */
export async function loadInsightsRows(
  userId: string,
  filter: InsightsFilter = {},
): Promise<AnalyticsRow[]> {
  const rows = await db
    .select({
      id: financeTransactions.id,
      accountId: financeTransactions.accountId,
      accountName: financeAccounts.name,
      transactionDate: financeTransactions.transactionDate,
      description: financeTransactions.description,
      amount: financeTransactions.amount,
      sourceCategory: financeTransactions.sourceCategory,
      category: financeTransactions.category,
      derivedCategory: financeTransactions.derivedCategory,
      derivedFlow: financeTransactions.derivedFlow,
      flowOverride: financeTransactions.flowOverride,
      transferGroupId: financeTransactions.transferGroupId,
      excludeFromBaseline: financeTransactions.excludeFromBaseline,
      eventLabel: financeTransactions.eventLabel,
    })
    .from(financeTransactions)
    .innerJoin(financeAccounts, eq(financeAccounts.id, financeTransactions.accountId))
    .where(and(...scopeConditions(userId, filter)))
    .orderBy(asc(financeTransactions.transactionDate), asc(financeTransactions.id));

  return rows.map((row) => ({
    id: row.id,
    accountId: row.accountId,
    accountName: row.accountName,
    transactionDate: row.transactionDate,
    description: row.description,
    amountCents: numericStringToCents(row.amount) ?? 0,
    sourceCategory: row.sourceCategory,
    category: row.category,
    derivedCategory: row.derivedCategory,
    derivedFlow: row.derivedFlow,
    flowOverride: row.flowOverride,
    transferGroupId: row.transferGroupId,
    excludeFromBaseline: row.excludeFromBaseline,
    eventLabel: row.eventLabel,
  }));
}

/** How many rows have never been through a reclassify — the dashboard says so if any have. */
export async function unclassifiedCount(userId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(financeTransactions)
    .where(
      and(
        eq(financeTransactions.userId, userId),
        sql`${financeTransactions.derivedFlow} is null`,
      ),
    );
  return row?.count ?? 0;
}

export type AccountCarryingCost = {
  accountId: string;
  accountName: string;
  interestCents: number;
  feesCents: number;
  /** The newest APR on the newest statement, as a percentage. */
  latestAprPercent: number | null;
  latestCreditLimitCents: number | null;
  latestClosingBalanceCents: number | null;
  statementCount: number;
};

export type CarryingCost = {
  interestCents: number;
  feesCents: number;
  byAccount: AccountCarryingCost[];
};

/**
 * What the accounts themselves cost, from the statement snapshots.
 *
 * 118 statements were imported by two earlier specs and read by nothing; this is the first
 * consumer. Interest and fees come from the statements rather than the register because a
 * statement states them outright, while the register only has them where the bank happened
 * to post a line item — and it is the one number a carrying cost must not guess at.
 *
 * Statement money is stored in the module sign, so a charge is negative; it is reported here
 * as a positive cost, matching `analytics.ts`.
 */
export async function loadCarryingCost(
  userId: string,
  filter: InsightsFilter = {},
): Promise<CarryingCost> {
  const conditions = [eq(financeStatements.userId, userId)];
  if (filter.from) conditions.push(gte(financeStatements.periodEnd, filter.from));
  if (filter.to) conditions.push(lte(financeStatements.periodEnd, filter.to));

  const rows = await db
    .select({
      accountId: financeStatements.accountId,
      accountName: financeAccounts.name,
      periodEnd: financeStatements.periodEnd,
      interestCharged: financeStatements.interestCharged,
      feesCharged: financeStatements.feesCharged,
      creditLimit: financeStatements.creditLimit,
      closingBalance: financeStatements.closingBalance,
    })
    .from(financeStatements)
    .innerJoin(financeAccounts, eq(financeAccounts.id, financeStatements.accountId))
    .where(and(...conditions))
    .orderBy(asc(financeStatements.accountId), asc(financeStatements.periodEnd));

  // One APR per account: the newest one on record. An APR history is a different panel, and
  // the question this one answers is "what is it costing me now".
  const rates = await db
    .select({
      accountId: financeStatements.accountId,
      aprPercent: financeStatementRates.aprPercent,
    })
    .from(financeStatementRates)
    .innerJoin(
      financeStatements,
      eq(financeStatements.id, financeStatementRates.statementId),
    )
    .where(eq(financeStatementRates.userId, userId))
    .orderBy(desc(financeStatements.periodEnd), desc(financeStatementRates.aprPercent));

  const aprByAccount = new Map<string, number>();
  for (const rate of rates) {
    if (!aprByAccount.has(rate.accountId)) {
      aprByAccount.set(rate.accountId, Number(rate.aprPercent));
    }
  }

  const byAccount = new Map<string, AccountCarryingCost>();
  for (const row of rows) {
    const entry = byAccount.get(row.accountId) ?? {
      accountId: row.accountId,
      accountName: row.accountName,
      interestCents: 0,
      feesCents: 0,
      latestAprPercent: aprByAccount.get(row.accountId) ?? null,
      latestCreditLimitCents: null,
      latestClosingBalanceCents: null,
      statementCount: 0,
    };
    entry.interestCents += Math.abs(numericStringToCents(row.interestCharged) ?? 0);
    entry.feesCents += Math.abs(numericStringToCents(row.feesCharged) ?? 0);
    // Rows arrive oldest first, so the last write wins and holds the newest statement.
    entry.latestCreditLimitCents = numericStringToCents(row.creditLimit);
    entry.latestClosingBalanceCents = numericStringToCents(row.closingBalance);
    entry.statementCount += 1;
    byAccount.set(row.accountId, entry);
  }

  const accounts = [...byAccount.values()].sort(
    (left, right) =>
      right.interestCents + right.feesCents - (left.interestCents + left.feesCents) ||
      left.accountName.localeCompare(right.accountName),
  );

  return {
    interestCents: accounts.reduce((total, entry) => total + entry.interestCents, 0),
    feesCents: accounts.reduce((total, entry) => total + entry.feesCents, 0),
    byAccount: accounts,
  };
}
