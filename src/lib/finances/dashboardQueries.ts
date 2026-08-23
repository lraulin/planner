import { and, asc, desc, eq, gte, isNotNull, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  financeAccounts,
  financePayees,
  financeRecurringBills,
  financeRecurringSpend,
  financeStatementRates,
  financeStatements,
  financeTransactions,
} from "@/db/schema";
import { listConnections, type BankConnectionRow } from "@/lib/banksync/queries";
import {
  effectiveMerchant,
  paydaysFrom,
  recurringMerchants,
  spendCandidates,
  spendCentsOf,
  type AnalyticsRow,
  type RecurringMerchant,
} from "./analytics";
import type { BillCharge, PendingRow } from "./available";
import type { Payday } from "./classify/income";
import {
  payeeClaimIndex,
  type CommitmentCharge,
  type StoredBillRow,
  type StoredSpend,
} from "./commitments";
import { numericStringToCents } from "./money";
import type { PeriodLedgerRow } from "./periodResult";
import { listAccounts } from "./queries";
import type { FinanceAccountRow } from "./types";
import { selectWorkingPending } from "./workingPending";
import { shiftDateKey, toDateKey } from "@/lib/schedule/geometry";

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
      accountKind: financeAccounts.kind,
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
      plannedWithdrawal: financeTransactions.plannedWithdrawal,
      payeeId: financeTransactions.payeeId,
      payeeName: financePayees.name,
    })
    .from(financeTransactions)
    .innerJoin(financeAccounts, eq(financeAccounts.id, financeTransactions.accountId))
    .leftJoin(
      financePayees,
      and(
        eq(financePayees.id, financeTransactions.payeeId),
        eq(financePayees.userId, userId),
      ),
    )
    .where(and(...scopeConditions(userId, filter)))
    .orderBy(asc(financeTransactions.transactionDate), asc(financeTransactions.id));

  return rows.map((row) => ({
    id: row.id,
    accountId: row.accountId,
    accountName: row.accountName,
    accountKind: row.accountKind,
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
    plannedWithdrawal: row.plannedWithdrawal,
    payeeId: row.payeeId,
    payeeName: row.payeeName,
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

/**
 * Every bill this user has declared a cadence for.
 *
 * Unfiltered by window on purpose. A yearly bill is a commitment in a month that holds none
 * of its charges, and a window-scoped read would make it flicker out of the recurring panel
 * and back onto the one-off review list every time someone narrowed the range.
 *
 * Cancelled and ignored bills are returned too. Filtering them here would make every caller's
 * behaviour depend on a decision it could not see; the ones that must exclude them — the
 * accrual, the forecast — check `status` themselves and say so.
 */
export async function loadRecurringBills(userId: string): Promise<StoredBillRow[]> {
  const [rows, payees] = await Promise.all([
    db
      .select({
        id: financeRecurringBills.id,
        name: financeRecurringBills.name,
        matchers: financeRecurringBills.matchers,
        status: financeRecurringBills.status,
        cancelledOn: financeRecurringBills.cancelledOn,
        url: financeRecurringBills.url,
        cadenceMonths: financeRecurringBills.cadenceMonths,
        cadenceDays: financeRecurringBills.cadenceDays,
        category: financeRecurringBills.category,
        expectedCents: financeRecurringBills.expectedCents,
        anchorDate: financeRecurringBills.anchorDate,
        scheduled: financeRecurringBills.scheduled,
        dueDay: financeRecurringBills.dueDay,
        notes: financeRecurringBills.notes,
      })
      .from(financeRecurringBills)
      .where(eq(financeRecurringBills.userId, userId))
      .orderBy(asc(financeRecurringBills.name)),
    db
      .select({
        id: financePayees.id,
        name: financePayees.name,
        commitmentId: financePayees.commitmentBillId,
      })
      .from(financePayees)
      .where(
        and(
          eq(financePayees.userId, userId),
          isNotNull(financePayees.commitmentBillId),
        ),
      )
      .orderBy(asc(financePayees.name)),
  ]);

  return rows.map((row) => ({
    ...row,
    payees: payees
      .filter((payee) => payee.commitmentId === row.id)
      .map(({ id, name }) => ({ id, name })),
    payeeIds: payees
      .filter((payee) => payee.commitmentId === row.id)
      .map((payee) => payee.id),
  }));
}

/** Every recurring-spend entry — tier 2. Unfiltered by window, for the same reason. */
export async function loadRecurringSpend(userId: string): Promise<StoredSpend[]> {
  const [rows, payees] = await Promise.all([
    db
      .select({
        id: financeRecurringSpend.id,
        name: financeRecurringSpend.name,
        matchers: financeRecurringSpend.matchers,
        period: financeRecurringSpend.period,
        amountSource: financeRecurringSpend.amountSource,
        expectedCents: financeRecurringSpend.expectedCents,
        active: financeRecurringSpend.active,
        category: financeRecurringSpend.category,
        notes: financeRecurringSpend.notes,
      })
      .from(financeRecurringSpend)
      .where(eq(financeRecurringSpend.userId, userId))
      .orderBy(asc(financeRecurringSpend.name)),
    db
      .select({
        id: financePayees.id,
        name: financePayees.name,
        commitmentId: financePayees.commitmentSpendId,
      })
      .from(financePayees)
      .where(
        and(
          eq(financePayees.userId, userId),
          isNotNull(financePayees.commitmentSpendId),
        ),
      )
      .orderBy(asc(financePayees.name)),
  ]);
  return rows.map((row) => ({
    ...row,
    payees: payees
      .filter((payee) => payee.commitmentId === row.id)
      .map(({ id, name }) => ({ id, name })),
  }));
}

/**
 * Everything the Finances **dashboard** reads, in one call.
 *
 * Composed from reads that already exist rather than reimplemented: `listAccounts` computes the
 * three-tier headline balance and `syncedBalanceAsOf` that `available.ts` turns on, and
 * `paydaysFrom` runs the same `detectIncome` the classifier does. Two implementations of "what
 * is a paycheck" is exactly how a dashboard comes to disagree with the page it links to.
 *
 * **Paydays and bill charges are derived here rather than in the view.** The full classified
 * history is a few thousand rows — the right payload for Insights, which re-slices all of it a
 * dozen ways, and the wrong one for a status page that needs a list of dates and a list of
 * charges. Both derivations are pure and neither depends on "today", so nothing about doing
 * them server-side makes the result depend on the deploy region's clock.
 */
export type DashboardData = {
  accounts: FinanceAccountRow[];
  /** Rows the bank has not yet posted. Signed in module convention. */
  pending: PendingRow[];
  bills: StoredBillRow[];
  spend: StoredSpend[];
  paydays: Payday[];
  /**
   * Every posted charge against a tier 1 bill, keyed by the **commitment's name** rather than
   * by the bank's merchant — so a bill covering two spellings arrives as one series.
   */
  billCharges: BillCharge[];
  /**
   * Charges against tier 2 entries, by commitment name, carrying the cost so the rate and the
   * "spent this period" figure can both be computed from one read.
   */
  spendCharges: Map<string, CommitmentCharge[]>;
  connections: BankConnectionRow[];
  /** Distinct `effectiveMerchant` strings, for the Commitments create picker. */
  merchants: string[];
  /**
   * Detected recurring merchants that no commitment has claimed. The Commitments review
   * list — propose, never apply.
   */
  review: RecurringMerchant[];
  /**
   * Recent ledger rows, for the period scorecard (`src/lib/finances/periodResult.ts`).
   *
   * Trimmed to {@link PERIOD_LEDGER_DAYS}, because a historical balance is reconstructed by
   * undoing what posted *after* a date — so only rows newer than the oldest period shown are
   * ever read, and shipping three years of history to the client to display six bars would
   * be a payload nobody looks at.
   */
  periodRows: PeriodLedgerRow[];
};

/**
 * How far back the scorecard's ledger reaches: comfortably more than the six fortnights the
 * panel shows, so the oldest bar still has every row it needs to walk back through.
 */
export const PERIOD_LEDGER_DAYS = 300;

export async function loadDashboard(userId: string): Promise<DashboardData> {
  const [accounts, rows, bills, spend, pendingRows, connections] = await Promise.all([
    listAccounts(userId),
    loadInsightsRows(userId),
    loadRecurringBills(userId),
    loadRecurringSpend(userId),
    db
      .select({
        accountId: financeTransactions.accountId,
        amount: financeTransactions.amount,
        source: financeTransactions.externalSource,
      })
      .from(financeTransactions)
      .where(
        and(
          eq(financeTransactions.userId, userId),
          eq(financeTransactions.pending, true),
        ),
      ),
    listConnections(userId),
  ]);

  // One index, built once, and the only route from a bank string to a commitment. Resolving
  // per panel is how Pizza Hut ends up folded into "Pizza" on one surface and not another.
  const index = payeeClaimIndex(bills, spend);
  const billNames = new Set(bills.map((bill) => bill.name));
  const spendNames = new Set(spend.map((entry) => entry.name));

  const billCharges: BillCharge[] = [];
  const spendCharges = new Map<string, CommitmentCharge[]>();
  const merchantSet = new Set<string>();

  for (const row of rows) {
    const merchant = effectiveMerchant(row);
    if (merchant !== "") merchantSet.add(merchant);
    const ref = row.payeeId ? index.get(row.payeeId) : undefined;
    if (ref === undefined) continue;

    if (ref.kind === "bill" && billNames.has(ref.name)) {
      billCharges.push({
        name: ref.name,
        dateKey: row.transactionDate,
        costCents: spendCentsOf(row),
      });
      continue;
    }
    if (ref.kind === "spend" && spendNames.has(ref.name)) {
      // `spendCentsOf` already returns 0 for anything that is not spending and expresses a
      // refund as a negative cost, so a card payment landing on a matched merchant cannot
      // inflate the rate — returning the couch has to reduce what the couch cost.
      const list = spendCharges.get(ref.name) ?? [];
      list.push({ dateKey: row.transactionDate, costCents: spendCentsOf(row) });
      spendCharges.set(ref.name, list);
    }
  }

  return {
    accounts,
    pending: selectWorkingPending(
      pendingRows.map((row) => ({
        accountId: row.accountId,
        amountCents: numericStringToCents(row.amount) ?? 0,
        source: row.source ?? "",
      })),
      accounts,
      Date.now(),
    ).map(({ accountId, amountCents }) => ({ accountId, amountCents })),
    bills,
    spend,
    paydays: paydaysFrom(rows),
    billCharges,
    spendCharges,
    connections,
    merchants: [...merchantSet].sort((left, right) => left.localeCompare(right)),
    review: reviewCandidates(rows, bills, index),
    periodRows: rows
      .filter((row) => row.transactionDate >= periodLedgerCutoff())
      .map((row) => ({
        accountId: row.accountId,
        transactionDate: row.transactionDate,
        description: row.description,
        amountCents: row.amountCents,
        transferGroupId: row.transferGroupId,
        plannedWithdrawal: row.plannedWithdrawal,
        eventLabel: row.eventLabel,
      })),
  };
}

/**
 * Everything the review list offers, from both detectors, most expensive first.
 *
 * One list rather than two, with `shape` on each row, because "is this a bill or is it
 * groceries" is a single decision and splitting it across two panels would ask it twice. A
 * merchant both detectors claim is bill-shaped: regular in amount *and* date is the stronger
 * finding, and the spend buttons are on every row anyway.
 *
 * `todayKey` comes from the server's day, which is allowed here for the same reason
 * `periodLedgerCutoff` is: it sizes the window a candidate is measured over, and never decides
 * a figure anyone reads. A candidate list an hour off at a timezone boundary costs nothing.
 */
function reviewCandidates(
  rows: readonly AnalyticsRow[],
  bills: readonly StoredBillRow[],
  index: ReturnType<typeof payeeClaimIndex>,
): RecurringMerchant[] {
  const billShaped = recurringMerchants(rows, bills).filter(
    (entry) => !entry.declared && (!entry.payeeId || !index.has(entry.payeeId)),
  );
  const claimed = new Set(billShaped.map((entry) => entry.merchant));

  const spendShaped = spendCandidates(rows, {
    todayKey: toDateKey(new Date()),
  }).filter(
    (entry) =>
      (!entry.payeeId || !index.has(entry.payeeId)) && !claimed.has(entry.merchant),
  );

  return [...billShaped, ...spendShaped].sort(
    (left, right) =>
      right.annualCents - left.annualCents ||
      left.merchant.localeCompare(right.merchant),
  );
}

/**
 * The oldest date the scorecard's ledger keeps.
 *
 * Uses the server's day only to size a window, never to decide what "today" is — the figures
 * themselves take `todayKey` from the reader (`agent-os/standards/development/dates.md`). A
 * window an hour off at a timezone boundary costs nothing; a headline an hour off would not.
 */
function periodLedgerCutoff(): string {
  return shiftDateKey(toDateKey(new Date()), -PERIOD_LEDGER_DAYS);
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
