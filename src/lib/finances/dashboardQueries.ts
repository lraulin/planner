import { and, asc, desc, eq, gte, isNotNull, lte, notInArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  financeAccounts,
  financeBudgetCategories,
  financePayees,
  financeStatementRates,
  financeStatements,
  financeTransactions,
} from "@/db/schema";
import {
  effectiveMerchant,
  paydaysFrom,
  recurringMerchants,
  spendCandidates,
  type AnalyticsRow,
  type RecurringMerchant,
} from "./analytics";
import { billChargesOf, type BillChargeRow } from "./billCharges";
import type { Payday } from "./classify/income";
import {
  payeeClaimIndex,
  projectForwardMonths,
  type CommitmentCharge,
  type StoredBillRow,
} from "./commitments";

import {
  billRows as billRowsOf,
  type BillRow,
  type SpendingVsIncome,
} from "./commitmentRows";

import { regularIncomePlan } from "./budget/incomePlan";
import { activeBillTotals } from "./commitmentRows";
import { numericStringToCents } from "./money";
import { oncePerRequest } from "@/lib/db/requestMemo";
import type { FinanceExecutor } from "./dbExecutor";
import { loadAccountsWithPending } from "./workingPendingQuery";
import { localDateKey } from "@/lib/schedule/geometry";
import { budgetContributionSql } from "./budget/contributionSql";
import type { EnvelopeReportRow } from "./reports";
import { bankRows, moneyRows } from "./splitRows";

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

/**
 * Which rows an analytics read counts, for a query that joins `finance_accounts`.
 *
 * Money: leaves. Every rollup downstream sums these by flow, and a parent beside its
 * children would double each split in the burn rate. The other source's pending holds are
 * left out for the reason `loadWorkingPendingSelection` gives. One definition, so a narrow
 * read like {@link loadPaydays} cannot count a row the full read would not.
 */
function countedRows(userId: string, supersededPendingIds: readonly string[]) {
  return and(
    moneyRows,
    eq(financeAccounts.userId, userId),
    supersededPendingIds.length
      ? notInArray(financeTransactions.id, [...supersededPendingIds])
      : undefined,
  );
}

/**
 * The paydays, from the income rows alone.
 *
 * The Budget page wants only this from the ledger, and was loading every classified
 * transaction — seven thousand rows across three joins — to throw away all but the income.
 * `paydaysFrom` keeps a row when its effective flow is income, and the fallback in
 * `effectiveFlow` never produces income, so "override, else derived, is income" selects
 * exactly the rows it would have kept. Same order as the full read, because the cadence
 * test walks the deposits in date order.
 */
export async function loadPaydays(userId: string): Promise<Payday[]> {
  const { pending } = await loadAccountsWithPending(userId);
  const rows = await db
    .select({
      id: financeTransactions.id,
      transactionDate: financeTransactions.transactionDate,
      description: financeTransactions.description,
      amount: financeTransactions.amount,
      derivedFlow: financeTransactions.derivedFlow,
      flowOverride: financeTransactions.flowOverride,
    })
    .from(financeTransactions)
    .innerJoin(financeAccounts, eq(financeAccounts.id, financeTransactions.accountId))
    .where(
      and(
        countedRows(userId, pending.supersededTransactionIds),
        eq(financeTransactions.userId, userId),
        sql`coalesce(${financeTransactions.flowOverride}, ${financeTransactions.derivedFlow}) = 'income'`,
      ),
    )
    .orderBy(asc(financeTransactions.transactionDate), asc(financeTransactions.id));

  return paydaysFrom(
    rows.map((row) => ({
      id: row.id,
      transactionDate: row.transactionDate,
      description: row.description,
      amountCents: numericStringToCents(row.amount) ?? 0,
      derivedFlow: row.derivedFlow,
      flowOverride: row.flowOverride,
    })),
  );
}

/** Every classified transaction, oldest first — the one read the whole dashboard runs on. */
export function loadInsightsRows(
  userId: string,
  filter: InsightsFilter = {},
): Promise<EnvelopeReportRow[]> {
  return insightsRowsOncePerRequest(db, userId, filter.from, filter.to);
}

/**
 * The largest read in the module, and the forecast, the review list and the dashboard each
 * ask for it; see `oncePerRequest`. The window is passed as two strings rather than as the
 * filter object so that two callers asking for the same window share one answer.
 */
const insightsRowsOncePerRequest = oncePerRequest(readInsightsRows);

async function readInsightsRows(
  executor: FinanceExecutor,
  userId: string,
  from: string | undefined,
  to: string | undefined,
): Promise<EnvelopeReportRow[]> {
  const { pending } = await loadAccountsWithPending(userId, executor);
  const rows = await executor
    .select({
      id: financeTransactions.id,
      accountId: financeTransactions.accountId,
      accountName: financeAccounts.name,
      accountKind: financeAccounts.kind,
      transactionDate: financeTransactions.transactionDate,
      description: financeTransactions.description,
      amount: financeTransactions.amount,
      sourceCategory: financeTransactions.sourceCategory,
      derivedFlow: financeTransactions.derivedFlow,
      flowOverride: financeTransactions.flowOverride,
      transferGroupId: financeTransactions.transferGroupId,
      payeeId: financeTransactions.payeeId,
      payeeName: financePayees.name,
      budgetCategoryName: financeBudgetCategories.name,
      budgetCategoryId: financeTransactions.budgetCategoryId,
      groupId: financeBudgetCategories.groupId,
      envelopeKind: financeBudgetCategories.kind,
      incomeRole: financeBudgetCategories.incomeRole,
      accountOffBudget: financeAccounts.offBudget,
      contributesToBudget: sql<boolean>`coalesce((${budgetContributionSql(userId, pending.supersededTransactionIds)}), false)`,
      notes: financeTransactions.notes,
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
    .leftJoin(
      financeBudgetCategories,
      and(
        eq(financeBudgetCategories.id, financeTransactions.budgetCategoryId),
        eq(financeBudgetCategories.userId, userId),
      ),
    )
    .where(
      and(
        countedRows(userId, pending.supersededTransactionIds),
        ...scopeConditions(userId, { from, to }),
      ),
    )
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
    derivedFlow: row.derivedFlow,
    flowOverride: row.flowOverride,
    transferGroupId: row.transferGroupId,
    payeeId: row.payeeId,
    payeeName: row.payeeName,
    budgetCategoryName: row.budgetCategoryName,
    budgetCategoryId: row.budgetCategoryId,
    groupId: row.groupId,
    envelopeKind: row.envelopeKind,
    incomeRole: row.incomeRole,
    accountOffBudget: row.accountOffBudget,
    contributesToBudget: row.contributesToBudget,
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
        // Bank rows: reclassify runs over what the bank sent, and a child's flow is its
        // parent's. An unclassified child would be a row nobody can act on.
        bankRows,
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
export function loadRecurringBills(userId: string): Promise<StoredBillRow[]> {
  return recurringBillsOncePerRequest(db, userId);
}

const recurringBillsOncePerRequest = oncePerRequest(readRecurringBills);

async function readRecurringBills(
  executor: FinanceExecutor,
  userId: string,
): Promise<StoredBillRow[]> {
  const [rows, payees] = await Promise.all([
    executor
      .select({
        id: financeBudgetCategories.id,
        name: financeBudgetCategories.name,
        status: financeBudgetCategories.status,
        cancelledOn: financeBudgetCategories.cancelledOn,
        url: financeBudgetCategories.url,
        cadenceMonths: financeBudgetCategories.cadenceMonths,
        cadenceDays: financeBudgetCategories.cadenceDays,
        expectedCents: financeBudgetCategories.expectedCents,
        anchorDate: financeBudgetCategories.anchorDate,
        scheduled: financeBudgetCategories.scheduled,
        dueDay: financeBudgetCategories.dueDay,
        leadDays: financeBudgetCategories.leadDays,
        notes: financeBudgetCategories.notes,
      })
      .from(financeBudgetCategories)
      .where(
        and(
          eq(financeBudgetCategories.userId, userId),
          eq(financeBudgetCategories.kind, "bill"),
        ),
      )
      .orderBy(asc(financeBudgetCategories.name)),
    executor
      .select({
        id: financePayees.id,
        name: financePayees.name,
        commitmentId: financePayees.claimedBudgetCategoryId,
      })
      .from(financePayees)
      .where(
        and(
          eq(financePayees.userId, userId),
          isNotNull(financePayees.claimedBudgetCategoryId),
        ),
      )
      .orderBy(asc(financePayees.name)),
  ]);

  return rows.map((row) => ({
    ...row,
    cadenceMonths: row.cadenceMonths ?? 1,
    payees: payees
      .filter((payee) => payee.commitmentId === row.id)
      .map(({ id, name }) => ({ id, name })),
    payeeIds: payees
      .filter((payee) => payee.commitmentId === row.id)
      .map((payee) => payee.id),
  }));
}

export type BillForecast = {
  billRows: BillRow[];
  /**
   * Posted charge dates per bill envelope id, oldest first — what `suggestLeadDays` reads to
   * offer a payment lead when a due day is declared. Already loaded for the projection.
   */
  chargeKeys: Map<string, string[]>;
  /**
   * Posted charges per bill envelope id — what `billsNeedingAmountReview` reads to offer a
   * new declared amount. Same series as `chargeKeys`, with the cents the projection already
   * loaded.
   */
  chargesByBill: Map<string, CommitmentCharge[]>;
  months: ReturnType<typeof projectForwardMonths>;
  comparison: SpendingVsIncome;
  incomePlan: ReturnType<typeof regularIncomePlan>;
};

/**
 * The Bills page's collapsed-by-default forecast panels — Next 12 months and Expected vs
 * income (`agent-os/specs/2026-08-23-2313-one-budget/` D8 carries these over from the
 * retired Commitments page, secondary rather than a permanent section).
 *
 * Reads the rows filed to a bill envelope, not the classified ledger: a bill's charges are
 * what is filed to its envelope, and nothing else on this page looks at a transaction. Paydays
 * are not read at all; expected income is the declared plan (`regularIncomePlan`), and the
 * pay-period forecast axis is gone
 * (`agent-os/specs/2026-08-25-1154-month-ahead-zero-based/` D5).
 */
export async function loadBillForecast(
  userId: string,
  todayKey: string,
): Promise<BillForecast> {
  const [chargeRows, bills, incomeRows] = await Promise.all([
    loadBillCharges(userId),
    loadRecurringBills(userId),
    db
      .select({
        id: financeBudgetCategories.id,
        name: financeBudgetCategories.name,
        kind: financeBudgetCategories.kind,
        incomeRole: financeBudgetCategories.incomeRole,
        expectedMonthlyIncomeCents: financeBudgetCategories.expectedMonthlyIncomeCents,
      })
      .from(financeBudgetCategories)
      .where(eq(financeBudgetCategories.userId, userId)),
  ]);
  const { flat: flatCharges, byBill: chargesByName } = billChargesOf(chargeRows, bills);

  const incomePlan = regularIncomePlan(incomeRows);
  const rowsOut = billRowsOf(bills, flatCharges, todayKey);
  return {
    billRows: rowsOut,
    chargeKeys: new Map(
      [...chargesByName].map(([id, charges]) => [
        id,
        charges.map((charge) => charge.dateKey).sort(),
      ]),
    ),
    chargesByBill: chargesByName,
    months: projectForwardMonths(bills, chargesByName, todayKey),
    incomePlan,
    comparison: {
      bills: activeBillTotals(rowsOut),
      income: {
        medianPaycheckCents: 0,
        monthlyCents: incomePlan.knownCents,
        annualCents: incomePlan.knownCents * 12,
      },
      remainder: {
        monthlyCents: incomePlan.knownCents - activeBillTotals(rowsOut).monthlyCents,
        annualCents: incomePlan.knownCents * 12 - activeBillTotals(rowsOut).annualCents,
      },
    },
  };
}

/**
 * Every posted charge filed to one of this user's bill envelopes, oldest first.
 *
 * What the bill forecast and the agent's commitment tools read in place of the whole
 * classified ledger. A bill's charges are what is filed to its envelope, and the envelope
 * join is the whole selection: the loop that used to run over every row skipped each one
 * whose envelope was not in the user's `kind = 'bill'` set, which is exactly the rows this
 * inner join drops. `spendCentsOf(row) > 0` stays in {@link billChargesOf}, so the one
 * definition of a cost is still the pure function's.
 *
 * Row scope is {@link countedRows}, the same predicate the full read uses, and the order is
 * the full read's (date, then id), so the result is the full read's rows with the unfiled
 * ones missing. `agent-os/specs/2026-10-13-1147-finance-narrow-ledger-reads/` D3.
 */
export async function loadBillCharges(userId: string): Promise<BillChargeRow[]> {
  const { pending } = await loadAccountsWithPending(userId);
  const rows = await db
    .select({
      // The joined envelope's id rather than the row's own nullable column: the inner join
      // makes them equal, and this one cannot be null.
      budgetCategoryId: financeBudgetCategories.id,
      transactionDate: financeTransactions.transactionDate,
      amount: financeTransactions.amount,
      derivedFlow: financeTransactions.derivedFlow,
      flowOverride: financeTransactions.flowOverride,
    })
    .from(financeTransactions)
    .innerJoin(financeAccounts, eq(financeAccounts.id, financeTransactions.accountId))
    .innerJoin(
      financeBudgetCategories,
      and(
        eq(financeBudgetCategories.id, financeTransactions.budgetCategoryId),
        eq(financeBudgetCategories.userId, userId),
        eq(financeBudgetCategories.kind, "bill"),
      ),
    )
    .where(
      and(
        countedRows(userId, pending.supersededTransactionIds),
        eq(financeTransactions.userId, userId),
      ),
    )
    .orderBy(asc(financeTransactions.transactionDate), asc(financeTransactions.id));

  return rows.map((row) => ({
    budgetCategoryId: row.budgetCategoryId,
    transactionDate: row.transactionDate,
    amountCents: numericStringToCents(row.amount) ?? 0,
    derivedFlow: row.derivedFlow,
    flowOverride: row.flowOverride,
  }));
}

/**
 * Every distinct merchant name the ledger shows, for the agent's candidate search.
 *
 * Reads the distinct `(description, payee name)` pairs and applies `effectiveMerchant` in
 * JS. The function is deterministic in exactly those two inputs, so the set of its outputs
 * over distinct inputs is the set over every row. Sorted as the dashboard sorted it.
 */
export async function loadMerchantNames(userId: string): Promise<string[]> {
  const { pending } = await loadAccountsWithPending(userId);
  const rows = await db
    .selectDistinct({
      description: financeTransactions.description,
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
    .where(
      and(
        countedRows(userId, pending.supersededTransactionIds),
        eq(financeTransactions.userId, userId),
      ),
    );

  const names = new Set<string>();
  for (const row of rows) {
    const merchant = effectiveMerchant(row);
    if (merchant !== "") names.add(merchant);
  }
  return [...names].sort((left, right) => left.localeCompare(right));
}

/**
 * Review candidates: recurring merchants no envelope has claimed. Propose, never apply.
 */
export async function loadReviewCandidates(
  userId: string,
): Promise<RecurringMerchant[]> {
  const [rows, bills, dismissedPayeeIds] = await Promise.all([
    loadInsightsRows(userId),
    loadRecurringBills(userId),
    db
      .select({ id: financePayees.id })
      .from(financePayees)
      .where(
        and(eq(financePayees.userId, userId), eq(financePayees.notACommitment, true)),
      ),
  ]);
  const index = payeeClaimIndex(bills);
  const dismissed = new Set(dismissedPayeeIds.map((row) => row.id));
  return reviewCandidates(rows, bills, index, dismissed);
}

/**
 * Everything the review list offers, from both detectors, most expensive first.
 *
 * One list rather than two, with `shape` on each row, because "is this a bill or is it
 * groceries" is a single decision and splitting it across two panels would ask it twice. A
 * merchant both detectors claim is bill-shaped: regular in amount *and* date is the stronger
 * finding, and the spend buttons are on every row anyway.
 *
 * `todayKey` only sizes the window a candidate is measured over, and never decides a
 * figure anyone reads. Use `localDateKey` anyway: `toDateKey(new Date())` is already
 * tomorrow after ~8pm in the Americas.
 */
function reviewCandidates(
  rows: readonly AnalyticsRow[],
  bills: readonly StoredBillRow[],
  index: ReturnType<typeof payeeClaimIndex>,
  dismissed: ReadonlySet<string>,
): RecurringMerchant[] {
  const billShaped = recurringMerchants(rows, bills).filter(
    (entry): entry is RecurringMerchant =>
      !entry.declared &&
      (!entry.payeeId || !index.has(entry.payeeId)) &&
      (!entry.payeeId || !dismissed.has(entry.payeeId)),
  );
  const claimed = new Set(billShaped.map((entry) => entry.merchant));

  // A merchant regular enough to look like ordinary spending (groceries, pizza) but not
  // regular enough to be a bill still surfaces here — Review proposes it as a plain envelope
  // with a `simple` template, not as a bill.
  const spendShaped = spendCandidates(rows, {
    todayKey: localDateKey(new Date()),
  }).filter(
    (entry) =>
      (!entry.payeeId || !index.has(entry.payeeId)) &&
      (!entry.payeeId || !dismissed.has(entry.payeeId)) &&
      !claimed.has(entry.merchant),
  );

  return [...billShaped, ...spendShaped].sort(
    (left, right) =>
      right.annualCents - left.annualCents ||
      left.merchant.localeCompare(right.merchant),
  );
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

  const [rows, rates] = await Promise.all([
    db
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
      .orderBy(asc(financeStatements.accountId), asc(financeStatements.periodEnd)),
    // One APR per account: the newest one on record. An APR history is a different panel,
    // and the question this one answers is "what is it costing me now".
    db
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
      .orderBy(
        desc(financeStatements.periodEnd),
        desc(financeStatementRates.aprPercent),
      ),
  ]);

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
