import { and, asc, desc, eq, gt, gte, inArray, lte, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  financeAccounts,
  financePaymentResolutions,
  financeStatementRates,
  financeStatements,
  financeTransactions,
  bankAccountLinks,
} from "@/db/schema";
import { numericStringToCents } from "./money";
import type {
  FinanceAccountRow,
  ParsedStatementRate,
  StatementListRow,
  TransactionFilter,
  TransactionListRow,
} from "./types";

/**
 * Reads for the register. Every one takes `userId` and scopes on it.
 *
 * Totals are computed in SQL rather than by summing in JS: `sum()` over `numeric` is exact,
 * and a column of thousands of amounts is precisely where float addition would start
 * quietly disagreeing with the bank.
 */

/**
 * The `userId` scope plus whatever the caller filtered on. Shared so a new filter cannot be
 * added to the list query and forgotten in the total, which would show a footer that
 * disagrees with the rows above it.
 */
function scopeConditions(userId: string, filter: TransactionFilter) {
  const conditions = [eq(financeTransactions.userId, userId)];
  if (filter.accountId) {
    conditions.push(eq(financeTransactions.accountId, filter.accountId));
  }
  if (filter.from) {
    conditions.push(gte(financeTransactions.transactionDate, filter.from));
  }
  if (filter.to) {
    conditions.push(lte(financeTransactions.transactionDate, filter.to));
  }
  return conditions;
}

/** Accounts with their balance and row count, newest-named first for a stable picker. */
export async function listAccounts(userId: string): Promise<FinanceAccountRow[]> {
  const rows = await db
    .select({
      id: financeAccounts.id,
      name: financeAccounts.name,
      kind: financeAccounts.kind,
      institution: financeAccounts.institution,
      url: financeAccounts.url,
      externalSource: financeAccounts.externalSource,
      externalKey: financeAccounts.externalKey,
      closedAt: financeAccounts.closedAt,
      offBudget: financeAccounts.offBudget,
      balance: sql<string>`coalesce(sum(${financeTransactions.amount}), 0)`,
      transactionCount: sql<number>`count(${financeTransactions.id})::int`,
    })
    .from(financeAccounts)
    .leftJoin(
      financeTransactions,
      and(
        eq(financeTransactions.accountId, financeAccounts.id),
        // Redundant with the join on id, but it keeps the user scope on both sides of the
        // join rather than trusting the foreign key to have been written correctly.
        eq(financeTransactions.userId, userId),
      ),
    )
    .where(eq(financeAccounts.userId, userId))
    .groupBy(financeAccounts.id)
    .orderBy(asc(financeAccounts.name));

  const latestRows = await db
    .select({
      accountId: financeStatements.accountId,
      periodEnd: financeStatements.periodEnd,
      closingBalance: financeStatements.closingBalance,
    })
    .from(financeStatements)
    .where(eq(financeStatements.userId, userId))
    .orderBy(desc(financeStatements.periodEnd), desc(financeStatements.id));

  const latestByAccount = new Map<
    string,
    { periodEnd: string; closingCents: number }
  >();
  for (const row of latestRows) {
    if (latestByAccount.has(row.accountId)) continue;
    latestByAccount.set(row.accountId, {
      periodEnd: row.periodEnd,
      closingCents: numericStringToCents(row.closingBalance) ?? 0,
    });
  }

  const postByAccount = new Map<string, number>();
  const latestList = [...latestByAccount.entries()];
  if (latestList.length > 0) {
    const postRows = await db
      .select({
        accountId: financeTransactions.accountId,
        total: sql<string>`coalesce(sum(${financeTransactions.amount}), 0)`,
      })
      .from(financeTransactions)
      .where(
        and(
          eq(financeTransactions.userId, userId),
          or(
            ...latestList.map(([accountId, latest]) =>
              and(
                eq(financeTransactions.accountId, accountId),
                gt(financeTransactions.transactionDate, latest.periodEnd),
              ),
            ),
          ),
        ),
      )
      .groupBy(financeTransactions.accountId);
    for (const row of postRows) {
      postByAccount.set(row.accountId, numericStringToCents(row.total) ?? 0);
    }
  }

  // A live balance from the bank outranks both the statement close and the ledger sum: it
  // is what the bank's own app shows, read seconds ago. Nulls where an account has no live
  // feed, which is every account until one is linked.
  const syncedRows = await db
    .select({
      accountId: bankAccountLinks.accountId,
      balanceCents: bankAccountLinks.balanceCents,
      balanceAsOf: bankAccountLinks.balanceAsOf,
      scrapeBalanceAsOf: bankAccountLinks.scrapeBalanceAsOf,
    })
    .from(bankAccountLinks)
    .where(eq(bankAccountLinks.userId, userId));

  const syncedByAccount = new Map(
    syncedRows
      .filter((row) => row.balanceCents !== null && row.balanceAsOf !== null)
      .map((row) => [
        row.accountId,
        {
          cents: row.balanceCents as number,
          asOf: row.balanceAsOf as Date,
          scrapeBalanceAsOf: row.scrapeBalanceAsOf,
        },
      ]),
  );

  return rows.map((row) => {
    const ledgerBalanceCents = numericStringToCents(row.balance) ?? 0;
    const latest = latestByAccount.get(row.id);
    const postCents = latest ? (postByAccount.get(row.id) ?? 0) : 0;
    const statementAnchored = latest
      ? latest.closingCents + postCents
      : ledgerBalanceCents;

    const synced = syncedByAccount.get(row.id);
    const balanceCents = synced ? synced.cents : statementAnchored;

    return {
      id: row.id,
      name: row.name,
      kind: row.kind,
      institution: row.institution,
      url: row.url,
      externalSource: row.externalSource,
      externalKey: row.externalKey,
      closedAt: row.closedAt,
      offBudget: row.offBudget,
      balanceCents,
      ledgerBalanceCents,
      statementClosingCents: latest?.closingCents ?? null,
      statementPeriodEnd: latest?.periodEnd ?? null,
      // Against a live balance this stops being a statement-versus-register question and
      // becomes the useful one: how far the register has drifted from what the bank says,
      // which is the same as asking whether the register is complete.
      balanceMismatchCents: synced || latest ? ledgerBalanceCents - balanceCents : 0,
      syncedBalanceAsOf: synced?.asOf ?? null,
      scrapeBalanceAsOf: synced?.scrapeBalanceAsOf ?? null,
      transactionCount: row.transactionCount,
    };
  });
}

/**
 * Register rows, newest first.
 *
 * The date window is a real query bound rather than a grid filter because the register grows
 * without limit — two years of four accounts is already 2,000 rows, and the page should not
 * get slower every year by default.
 */
export async function listTransactions(
  userId: string,
  filter: TransactionFilter = {},
): Promise<TransactionListRow[]> {
  const rows = await db
    .select({
      id: financeTransactions.id,
      accountId: financeTransactions.accountId,
      accountName: financeAccounts.name,
      accountKind: financeAccounts.kind,
      transactionDate: financeTransactions.transactionDate,
      postedDate: financeTransactions.postedDate,
      pending: financeTransactions.pending,
      description: financeTransactions.description,
      amount: financeTransactions.amount,
      sourceCategory: financeTransactions.sourceCategory,
      category: financeTransactions.category,
      derivedCategory: financeTransactions.derivedCategory,
      derivedFlow: financeTransactions.derivedFlow,
      flowOverride: financeTransactions.flowOverride,
      excludeFromBaseline: financeTransactions.excludeFromBaseline,
      eventLabel: financeTransactions.eventLabel,
      plannedWithdrawal: financeTransactions.plannedWithdrawal,
      notes: financeTransactions.notes,
      balanceAfter: financeTransactions.balanceAfter,
    })
    .from(financeTransactions)
    .innerJoin(financeAccounts, eq(financeAccounts.id, financeTransactions.accountId))
    .where(and(...scopeConditions(userId, filter)))
    .orderBy(
      desc(financeTransactions.transactionDate),
      // Same-day rows need a tiebreak or their order shifts between loads, which reads as
      // the register rearranging itself for no reason.
      desc(financeTransactions.createdAt),
      asc(financeTransactions.id),
    );

  return rows.map((row) => ({
    id: row.id,
    accountId: row.accountId,
    accountName: row.accountName,
    accountKind: row.accountKind,
    transactionDate: row.transactionDate,
    postedDate: row.postedDate,
    pending: row.pending,
    description: row.description,
    amountCents: numericStringToCents(row.amount) ?? 0,
    sourceCategory: row.sourceCategory,
    category: row.category,
    derivedCategory: row.derivedCategory,
    derivedFlow: row.derivedFlow,
    flowOverride: row.flowOverride,
    excludeFromBaseline: row.excludeFromBaseline,
    eventLabel: row.eventLabel,
    plannedWithdrawal: row.plannedWithdrawal,
    notes: row.notes,
    balanceAfterCents: numericStringToCents(row.balanceAfter),
  }));
}

/** Net of the transactions matching a filter, in cents. Summed in SQL. */
export async function transactionTotalCents(
  userId: string,
  filter: TransactionFilter = {},
): Promise<number> {
  const [row] = await db
    .select({ total: sql<string>`coalesce(sum(${financeTransactions.amount}), 0)` })
    .from(financeTransactions)
    .where(and(...scopeConditions(userId, filter)));

  return numericStringToCents(row?.total ?? "0") ?? 0;
}

/** One transaction, scoped to its owner. Null when it is not theirs. */
export async function getTransaction(
  userId: string,
  transactionId: string,
): Promise<TransactionListRow | null> {
  const [row] = await db
    .select({
      id: financeTransactions.id,
      accountId: financeTransactions.accountId,
      accountName: financeAccounts.name,
      accountKind: financeAccounts.kind,
      transactionDate: financeTransactions.transactionDate,
      postedDate: financeTransactions.postedDate,
      pending: financeTransactions.pending,
      description: financeTransactions.description,
      amount: financeTransactions.amount,
      sourceCategory: financeTransactions.sourceCategory,
      category: financeTransactions.category,
      derivedCategory: financeTransactions.derivedCategory,
      derivedFlow: financeTransactions.derivedFlow,
      flowOverride: financeTransactions.flowOverride,
      excludeFromBaseline: financeTransactions.excludeFromBaseline,
      eventLabel: financeTransactions.eventLabel,
      plannedWithdrawal: financeTransactions.plannedWithdrawal,
      notes: financeTransactions.notes,
      balanceAfter: financeTransactions.balanceAfter,
    })
    .from(financeTransactions)
    .innerJoin(financeAccounts, eq(financeAccounts.id, financeTransactions.accountId))
    .where(
      and(
        eq(financeTransactions.id, transactionId),
        eq(financeTransactions.userId, userId),
      ),
    )
    .limit(1);

  if (!row) return null;
  return {
    id: row.id,
    accountId: row.accountId,
    accountName: row.accountName,
    accountKind: row.accountKind,
    transactionDate: row.transactionDate,
    postedDate: row.postedDate,
    pending: row.pending,
    description: row.description,
    amountCents: numericStringToCents(row.amount) ?? 0,
    sourceCategory: row.sourceCategory,
    category: row.category,
    derivedCategory: row.derivedCategory,
    derivedFlow: row.derivedFlow,
    flowOverride: row.flowOverride,
    excludeFromBaseline: row.excludeFromBaseline,
    eventLabel: row.eventLabel,
    plannedWithdrawal: row.plannedWithdrawal,
    notes: row.notes,
    balanceAfterCents: numericStringToCents(row.balanceAfter),
  };
}

/** Statement snapshots, newest period first. Always scoped by userId. */
export async function listStatements(
  userId: string,
  filter: { accountId?: string } = {},
): Promise<StatementListRow[]> {
  const conditions = [eq(financeStatements.userId, userId)];
  if (filter.accountId) {
    conditions.push(eq(financeStatements.accountId, filter.accountId));
  }

  const rows = await db
    .select({
      id: financeStatements.id,
      accountId: financeStatements.accountId,
      accountName: financeAccounts.name,
      periodStart: financeStatements.periodStart,
      periodEnd: financeStatements.periodEnd,
      statementDate: financeStatements.statementDate,
      openingBalance: financeStatements.openingBalance,
      closingBalance: financeStatements.closingBalance,
      paymentDueDate: financeStatements.paymentDueDate,
      minimumPayment: financeStatements.minimumPayment,
      pastDueAmount: financeStatements.pastDueAmount,
      creditLimit: financeStatements.creditLimit,
      availableCredit: financeStatements.availableCredit,
      paymentsCredits: financeStatements.paymentsCredits,
      purchases: financeStatements.purchases,
      cashAdvances: financeStatements.cashAdvances,
      balanceTransfers: financeStatements.balanceTransfers,
      feesCharged: financeStatements.feesCharged,
      interestCharged: financeStatements.interestCharged,
      ytdFees: financeStatements.ytdFees,
      ytdInterest: financeStatements.ytdInterest,
      rewardsPoints: financeStatements.rewardsPoints,
    })
    .from(financeStatements)
    .innerJoin(financeAccounts, eq(financeAccounts.id, financeStatements.accountId))
    .where(and(...conditions))
    .orderBy(desc(financeStatements.periodEnd), asc(financeStatements.id));

  const ratesByStatement = new Map<string, ParsedStatementRate[]>();
  if (rows.length > 0) {
    const rateRows = await db
      .select({
        statementId: financeStatementRates.statementId,
        balanceType: financeStatementRates.balanceType,
        aprPercent: financeStatementRates.aprPercent,
        balanceSubject: financeStatementRates.balanceSubject,
        interestCharged: financeStatementRates.interestCharged,
      })
      .from(financeStatementRates)
      .where(
        and(
          eq(financeStatementRates.userId, userId),
          inArray(
            financeStatementRates.statementId,
            rows.map((row) => row.id),
          ),
        ),
      );
    for (const rate of rateRows) {
      const list = ratesByStatement.get(rate.statementId) ?? [];
      list.push({
        balanceType: rate.balanceType,
        aprPercent: Number(rate.aprPercent),
        balanceSubjectCents: numericStringToCents(rate.balanceSubject),
        interestChargedCents: numericStringToCents(rate.interestCharged),
      });
      ratesByStatement.set(rate.statementId, list);
    }
  }

  return rows.map((row) => ({
    id: row.id,
    accountId: row.accountId,
    accountName: row.accountName,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    statementDate: row.statementDate,
    openingBalanceCents: numericStringToCents(row.openingBalance) ?? 0,
    closingBalanceCents: numericStringToCents(row.closingBalance) ?? 0,
    paymentDueDate: row.paymentDueDate,
    minimumPaymentCents: numericStringToCents(row.minimumPayment),
    pastDueAmountCents: numericStringToCents(row.pastDueAmount),
    creditLimitCents: numericStringToCents(row.creditLimit),
    availableCreditCents: numericStringToCents(row.availableCredit),
    paymentsCreditsCents: numericStringToCents(row.paymentsCredits),
    purchasesCents: numericStringToCents(row.purchases),
    cashAdvancesCents: numericStringToCents(row.cashAdvances),
    balanceTransfersCents: numericStringToCents(row.balanceTransfers),
    feesChargedCents: numericStringToCents(row.feesCharged),
    interestChargedCents: numericStringToCents(row.interestCharged),
    ytdFeesCents: numericStringToCents(row.ytdFees),
    ytdInterestCents: numericStringToCents(row.ytdInterest),
    rewardsPoints: row.rewardsPoints,
    rates: ratesByStatement.get(row.id) ?? [],
  }));
}

export type PaymentResolutionRow = {
  id: string;
  source: string;
  externalId: string;
  transactionDate: string;
  amountCents: number;
  counterparty: string;
  direction: string;
};

export async function listPaymentResolutions(
  userId: string,
): Promise<PaymentResolutionRow[]> {
  const rows = await db
    .select({
      id: financePaymentResolutions.id,
      source: financePaymentResolutions.source,
      externalId: financePaymentResolutions.externalId,
      transactionDate: financePaymentResolutions.transactionDate,
      amount: financePaymentResolutions.amount,
      counterparty: financePaymentResolutions.counterparty,
      direction: financePaymentResolutions.direction,
    })
    .from(financePaymentResolutions)
    .where(eq(financePaymentResolutions.userId, userId))
    .orderBy(
      desc(financePaymentResolutions.transactionDate),
      asc(financePaymentResolutions.externalId),
    );

  return rows.map((row) => ({
    id: row.id,
    source: row.source,
    externalId: row.externalId,
    transactionDate: row.transactionDate,
    amountCents: numericStringToCents(row.amount) ?? 0,
    counterparty: row.counterparty,
    direction: row.direction,
  }));
}

export async function getPaymentResolution(
  userId: string,
  resolutionId: string,
): Promise<PaymentResolutionRow | null> {
  const [row] = await db
    .select({
      id: financePaymentResolutions.id,
      source: financePaymentResolutions.source,
      externalId: financePaymentResolutions.externalId,
      transactionDate: financePaymentResolutions.transactionDate,
      amount: financePaymentResolutions.amount,
      counterparty: financePaymentResolutions.counterparty,
      direction: financePaymentResolutions.direction,
    })
    .from(financePaymentResolutions)
    .where(
      and(
        eq(financePaymentResolutions.id, resolutionId),
        eq(financePaymentResolutions.userId, userId),
      ),
    )
    .limit(1);
  if (!row) return null;
  return {
    id: row.id,
    source: row.source,
    externalId: row.externalId,
    transactionDate: row.transactionDate,
    amountCents: numericStringToCents(row.amount) ?? 0,
    counterparty: row.counterparty,
    direction: row.direction,
  };
}
