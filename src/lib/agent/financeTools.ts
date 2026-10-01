/**
 * Read-only agent tools over Finances. Every figure comes from the same
 * composition the Insights dashboard uses.
 */

import {
  coverageGap,
  effectiveCategory,
  effectiveFlow,
  effectiveMerchant,
  rowsRange,
  type AnalyticsRow,
  type DateRange,
} from "@/lib/finances/analytics";
import {
  loadCarryingCost,
  loadDashboard,
  loadInsightsRows,
  loadRecurringBills,
  unclassifiedCount,
} from "@/lib/finances/dashboardQueries";
import { billAnchor, unclaimedMerchants } from "@/lib/finances/commitments";
import {
  annualCents,
  cadenceLabel,
  cadenceOf,
  type Cadence,
} from "@/lib/finances/recurringBills";
import { deleteBudgetCategory } from "@/lib/finances/budget/mutations";
import { upsertBillEnvelope } from "@/lib/finances/mutations";
import {
  addAlias,
  createPayee,
  replaceCommitmentPayees,
} from "@/lib/finances/payees/mutations";
import { listPayees, type PayeeRow } from "@/lib/finances/payees/queries";
import { normalizeMerchant } from "@/lib/finances/classify/merchant";
import { loadBudget } from "@/lib/finances/budget/queries";
import {
  spendingComparisonRows,
  migrateReportNames,
  applyReportFilters,
  spendingContributions,
  rankedReportSpending,
  reportMonthlySeries,
  reportRange,
  cashReportPoints,
  type SpendingScope,
} from "@/lib/finances/reports";
import {
  analyzeInsights,
  type InsightsAnalysis,
} from "@/lib/finances/insightsAnalysis";
import {
  insightsFilterOptions,
  type InsightsReportFilter,
  type InsightsWindowKey,
} from "@/lib/finances/insightsFilter";
import { listAccounts, listStatements } from "@/lib/finances/queries";
import type { FinanceAccountRow } from "@/lib/finances/types";
import { accountBalanceView, type PendingRow } from "@/lib/finances/workingBalance";
import { loadWorkingPendingSelection } from "@/lib/finances/workingPendingQuery";
import { reconcileAccounts } from "@/lib/finances/reconcile";
import { searchTransactions } from "@/lib/finances/transactionSearch";
import { zonedDateKey } from "@/lib/schedule/geometry";
import type { InsightsAxis } from "@/lib/settings/finances";
import type { FinanceFlowKind } from "@/db/schema";
import { AgentError } from "./errors";
import { optionalNumber, optionalString } from "./parse";
import { pageBounds, paginate } from "./pagination";

/** Lee's zone. The tools run on Vercel (UTC), where the process clock's day ends at 8 PM here. */
const AGENT_TIME_ZONE = "America/New_York";

function agentToday(): string {
  return zonedDateKey(new Date(), AGENT_TIME_ZONE);
}

const EMPTY_INCOME = {
  paycheckMonthlyCents: 0,
  otherMonthlyCents: 0,
  totalMonthlyCents: 0,
  medianPaycheckCents: 0,
  paydayCount: 0,
};

type FinanceWindow = {
  filter: InsightsReportFilter;
  window: InsightsWindowKey;
  axis: InsightsAxis;
  levelRecurring: boolean;
  from?: string;
  to?: string;
};

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

function parseAxis(value: unknown): InsightsAxis {
  return value === "pay-period" || value === "pay_period" ? "pay-period" : "month";
}

function parseFinanceWindow(args: Record<string, unknown>): FinanceWindow {
  return {
    filter: {
      accountIds: asStringArray(args.accountIds),
      categories: asStringArray(args.categories),
      merchants: asStringArray(args.merchants),
    },
    window: (typeof args.window === "string"
      ? args.window
      : "12m") as InsightsWindowKey,
    axis: parseAxis(args.axis),
    levelRecurring: args.levelRecurring === true,
    from: optionalString(args, "from"),
    to: optionalString(args, "to"),
  };
}

function explicitRange(
  parsed: FinanceWindow,
  history: DateRange | null,
): DateRange | undefined {
  if (!parsed.from && !parsed.to) return undefined;
  if (!history) return undefined;
  return {
    startKey: parsed.from ?? history.startKey,
    endKey: parsed.to ?? history.endKey,
  };
}

async function loadAnalyzed(userId: string, args: Record<string, unknown>) {
  const parsed = parseFinanceWindow(args);
  const [rows, bills, statements] = await Promise.all([
    loadInsightsRows(userId),
    loadRecurringBills(userId),
    listStatements(userId),
  ]);
  const analysis = analyzeInsights(rows, bills, {
    filter: parsed.filter,
    window: parsed.window,
    axis: parsed.axis,
    levelRecurring: parsed.levelRecurring,
    today: agentToday(),
    range: explicitRange(parsed, rowsRange(rows)),
    statements,
  });
  return { rows, parsed, analysis };
}

function flattenFlowPoint(point: {
  bucket: { key: string; label: string; startKey: string; endKey: string };
  incomeCents: number;
  spendCents: number;
  fixedCents: number;
  variableCents: number;
  netCents: number;
  externalTransferCents: number;
  trailingSpendCents: number | null;
  trailingIncomeCents: number | null;
  trailingNetCents: number | null;
  statementPositionCents?: number | null;
  statementNetCents?: number | null;
  residualCents?: number | null;
}) {
  return {
    key: point.bucket.key,
    label: point.bucket.label,
    startKey: point.bucket.startKey,
    endKey: point.bucket.endKey,
    incomeCents: point.incomeCents,
    spendCents: point.spendCents,
    fixedCents: point.fixedCents,
    variableCents: point.variableCents,
    netCents: point.netCents,
    externalTransferCents: point.externalTransferCents,
    trailingSpendCents: point.trailingSpendCents,
    trailingIncomeCents: point.trailingIncomeCents,
    trailingNetCents: point.trailingNetCents,
    statementPositionCents: point.statementPositionCents ?? null,
    statementNetCents: point.statementNetCents ?? null,
    residualCents: point.residualCents ?? null,
  };
}

/** Where an account's headline posted balance comes from (see `listAccounts`). */
export type AgentBalanceSource = "live" | "statement" | "ledger";

function balanceSourceOf(account: FinanceAccountRow): AgentBalanceSource {
  if (account.syncedBalanceAsOf) return "live";
  return account.statementPeriodEnd ? "statement" : "ledger";
}

/**
 * One account as the agent sees it: the same working balance Dashboard and Budget show.
 *
 * A live balance is what the bank reports as posted, so the pending rows the working-balance
 * rule selects go on top (`accountBalanceView`). A statement- or ledger-sourced balance
 * already contains every pending row, so pendingCents is 0 there. mismatchCents compares
 * the register with that working figure; comparing it with the posted figure alone, as
 * before, reported every pending charge as drift.
 */
export function agentAccount(
  account: FinanceAccountRow,
  pending: readonly PendingRow[],
) {
  const view = accountBalanceView(account, pending);
  const source = balanceSourceOf(account);
  return {
    id: account.id,
    name: account.name,
    kind: account.kind,
    institution: account.institution,
    balanceCents: view.workingCents,
    balanceSource: source,
    balanceAsOf: account.syncedBalanceAsOf
      ? account.syncedBalanceAsOf.toISOString()
      : null,
    postedCents: view.postedCents,
    pendingCents: view.pendingCents,
    ledgerBalanceCents: account.ledgerBalanceCents,
    statementClosingCents: account.statementClosingCents,
    statementPeriodEnd: account.statementPeriodEnd,
    mismatchCents:
      source === "ledger" ? 0 : account.ledgerBalanceCents - view.workingCents,
    transactionCount: account.transactionCount,
    closedAt: account.closedAt ? account.closedAt.toISOString() : null,
  };
}

type BudgetData = Awaited<ReturnType<typeof loadBudget>>;

type FinanceOverviewInputs = {
  accounts: readonly FinanceAccountRow[];
  pending: readonly PendingRow[];
  rows: readonly AnalyticsRow[];
  unclassifiedCount: number;
  carrying: { interestCents: number; feesCents: number };
  statements: Parameters<typeof coverageGap>[1];
  budget: {
    categories: readonly Pick<
      BudgetData["categories"][number],
      "id" | "name" | "groupId" | "kind" | "incomeRole" | "expectedMonthlyIncomeCents"
    >[];
    groups: readonly Pick<
      BudgetData["groups"][number],
      "id" | "name" | "parentGroupId" | "kind"
    >[];
  };
};

/** get_finance_overview's response from loaded data. Pure, so the size guard can drive it. */
export function financeOverviewResponse(input: FinanceOverviewInputs) {
  const history = rowsRange(input.rows);
  const options = insightsFilterOptions(input.rows);
  return {
    envelopes: input.budget.categories.map((row) => ({
      id: row.id,
      name: row.name,
      groupId: row.groupId,
      kind: row.kind,
      incomeRole: row.incomeRole,
      expectedMonthlyIncomeCents: row.expectedMonthlyIncomeCents,
    })),
    groups: input.budget.groups.map((row) => ({
      id: row.id,
      name: row.name,
      parentGroupId: row.parentGroupId,
      kind: row.kind,
    })),
    accounts: input.accounts.map((account) => agentAccount(account, input.pending)),
    history: {
      startKey: history?.startKey ?? null,
      endKey: history?.endKey ?? null,
      transactionCount: input.rows.length,
    },
    unclassifiedCount: input.unclassifiedCount,
    coverage: coverageGap(input.rows, input.statements),
    categories: options.categories,
    // The full merchant vocabulary was most of this response (hundreds of raw bank
    // descriptions) and pushed it past the client's size limit. list_payees pages it.
    merchantCount: options.merchants.length,
    merchantsTool: "list_payees" as const,
    carryingCost: {
      interestCents: input.carrying.interestCents,
      feesCents: input.carrying.feesCents,
    },
  };
}

export async function getFinanceOverviewTool(userId: string) {
  const [accounts, rows, unclassified, carrying, statements, budget] =
    await Promise.all([
      listAccounts(userId),
      loadInsightsRows(userId),
      unclassifiedCount(userId),
      loadCarryingCost(userId),
      listStatements(userId),
      loadBudget(userId, null),
    ]);
  const pending = await loadWorkingPendingSelection(userId, accounts);
  return financeOverviewResponse({
    accounts,
    pending: pending.rows,
    rows,
    unclassifiedCount: unclassified,
    carrying,
    statements,
    budget,
  });
}

export async function getCashFlowTool(userId: string, args: Record<string, unknown>) {
  const { parsed, analysis } = await loadAnalyzed(userId, args);
  if (analysis.empty) {
    return {
      range: null,
      axis: parsed.axis,
      window: parsed.from || parsed.to ? "custom" : parsed.window,
      levelRecurring: parsed.levelRecurring,
      points: [],
      totals: {
        incomeCents: 0,
        spendCents: 0,
        fixedCents: 0,
        variableCents: 0,
        netCents: 0,
        externalTransferCents: 0,
        statementNetCents: null,
        residualCents: null,
      },
      income: EMPTY_INCOME,
    };
  }

  const reportPoints = cashReportPoints(analysis.windowed, analysis.flow);
  const totals = reportPoints.reduce(
    (sum, point) => ({
      incomeCents: sum.incomeCents + point.incomeCents,
      spendCents: sum.spendCents + point.spendCents,
      fixedCents: sum.fixedCents + point.fixedCents,
      variableCents: sum.variableCents + point.variableCents,
      netCents: sum.netCents + point.netCents,
      externalTransferCents: sum.externalTransferCents + point.externalTransferCents,
      statementNetCents:
        point.statementNetCents === null || point.statementNetCents === undefined
          ? sum.statementNetCents
          : (sum.statementNetCents ?? 0) + point.statementNetCents,
      residualCents:
        point.residualCents === null || point.residualCents === undefined
          ? sum.residualCents
          : (sum.residualCents ?? 0) + point.residualCents,
    }),
    {
      incomeCents: 0,
      spendCents: 0,
      fixedCents: 0,
      variableCents: 0,
      netCents: 0,
      externalTransferCents: 0,
      statementNetCents: null as number | null,
      residualCents: null as number | null,
    },
  );

  return {
    range: analysis.range,
    axis: parsed.axis,
    window: parsed.from || parsed.to ? "custom" : parsed.window,
    levelRecurring: parsed.levelRecurring,
    points: reportPoints.map(flattenFlowPoint),
    totals,
    income: analysis.income,
  };
}

export async function getSpendingBreakdownTool(
  userId: string,
  args: Record<string, unknown>,
) {
  const [rows, data] = await Promise.all([
    loadInsightsRows(userId),
    loadBudget(userId, null),
  ]);
  const parsed = parseFinanceWindow(args);
  const by = args.by === "merchant" || args.by === "group" ? args.by : "category";
  const scope: SpendingScope =
    args.scope === "savings" || args.scope === "all" ? args.scope : "living";
  const range =
    explicitRange(parsed, rowsRange(rows)) ??
    reportRange(parsed.window, data.todayKey, rows[0]?.transactionDate ?? null);
  const categoryMigration = migrateReportNames(
    parsed.filter.categories,
    data.categories,
  );
  const payeeMigration = migrateReportNames(parsed.filter.merchants, [
    ...new Map(
      rows.flatMap((row) =>
        row.payeeId && row.payeeName
          ? [[row.payeeId, { id: row.payeeId, name: row.payeeName }] as const]
          : [],
      ),
    ).values(),
  ]);
  if (categoryMigration.unresolved.length || payeeMigration.unresolved.length)
    throw new Error(
      `Name filters are ambiguous or missing: ${[...categoryMigration.unresolved, ...payeeMigration.unresolved].join(", ")}. Use IDs from get_finance_overview.`,
    );
  const filtered = applyReportFilters(rows, {
    accountIds: parsed.filter.accountIds,
    categoryIds:
      args.categoryIds === undefined
        ? categoryMigration.ids
        : asStringArray(args.categoryIds),
    payeeIds:
      args.payeeIds === undefined ? payeeMigration.ids : asStringArray(args.payeeIds),
  });
  const contributing = spendingContributions(filtered, scope).filter(
    (row) =>
      row.transactionDate >= range.startKey && row.transactionDate <= range.endKey,
  );
  const ranked = rankedReportSpending(contributing, data, by);
  const limit = Math.min(Math.max(optionalNumber(args, "limit") ?? 20, 1), 100);
  const items = ranked.slice(0, limit);
  return {
    range,
    by,
    scope,
    items,
    totalSpendCents: ranked.reduce((sum, row) => sum + row.cents, 0),
    otherCents: ranked.slice(limit).reduce((sum, row) => sum + row.cents, 0),
    returned: items.length,
    total: ranked.length,
    ...(args.trend === true
      ? {
          trends: reportMonthlySeries(
            spendingComparisonRows(rows, {
              accountIds: parsed.filter.accountIds,
              categoryIds:
                args.categoryIds === undefined
                  ? categoryMigration.ids
                  : asStringArray(args.categoryIds),
              payeeIds:
                args.payeeIds === undefined
                  ? payeeMigration.ids
                  : asStringArray(args.payeeIds),
            }),
            scope,
            range,
            data.todayKey,
          ).map((point) => ({
            key: point.bucket.key,
            label: point.bucket.label,
            startKey: point.bucket.startKey,
            endKey: point.bucket.endKey,
            spendingCents: point.spendCents,
            regularIncomeCents: point.incomeCents,
          })),
        }
      : {}),
  };
}

/** Which declared statuses `list_recurring_bills` returns; detected merchants are active. */
export type RecurringStatusFilter = "active" | "paused" | "cancelled" | "any";

/** The default page: small enough that the whole response stays well under the gateway cap. */
export const RECURRING_BILLS_DEFAULT_LIMIT = 20;

/**
 * The `list_recurring_bills` payload, as a pure function of the analysis.
 *
 * **Key order is the contract here, not style.** The connector gateway keeps the first
 * 20,000 bytes of a tool's text and drops the rest, and with 60-odd bills ahead of it the
 * `upcoming` section never arrived — every due date was cut off. JSON keeps insertion order,
 * so the short, decision-bearing sections (the active total, what is due next) go first and
 * the long table goes last, paged.
 *
 * `annualTotalCents` covers every active row the filter matched, not just the page, the same
 * way `search_transactions` totals its whole match set.
 */
export function recurringBillsResponse(
  analysis: InsightsAnalysis,
  options: {
    includeUpcoming: boolean;
    status: RecurringStatusFilter;
    offset?: number;
    limit?: number;
  },
) {
  const bounds = pageBounds(options.offset, options.limit, {
    limit: RECURRING_BILLS_DEFAULT_LIMIT,
  });
  if (analysis.empty) {
    return {
      range: null,
      annualTotalCents: 0,
      upcoming: [],
      bills: [],
      pageInfo: paginate([], bounds).pageInfo,
    };
  }
  const matching = analysis.recurring.filter(
    (entry) => options.status === "any" || entry.status === options.status,
  );
  const page = paginate(matching, bounds);
  return {
    range: analysis.range,
    // Paused and cancelled bills stay listed as history, but a year of them costs nothing —
    // the same rule the Bills page total follows (`activeBillTotals`).
    annualTotalCents: analysis.recurring
      .filter((entry) => entry.status === "active")
      .reduce((total, entry) => total + entry.annualCents, 0),
    upcoming: options.includeUpcoming
      ? analysis.upcoming.map((entry) => ({
          id: entry.billId ?? null,
          merchant: entry.merchant,
          dueOn: entry.dueOn,
          daysAway: entry.daysAway,
          expectedCents: entry.expectedCents,
          cadence: cadenceLabel(entry.cadence),
          lastChargeOn: entry.lastChargeOn,
        }))
      : [],
    bills: page.items.map((entry) => ({
      id: entry.billId ?? null,
      merchant: entry.merchant,
      status: entry.status,
      typicalCents: entry.typicalCents,
      lowCents: entry.lowCents,
      highCents: entry.highCents,
      deviationCents: entry.deviationCents,
      chargeCount: entry.chargeCount,
      observedGapDays: entry.observedGapDays,
      cadence: entry.cadence === null ? null : cadenceLabel(entry.cadence),
      annualCents: entry.annualCents,
      lastChargeOn: entry.lastChargeOn,
      declared: entry.declared,
      scheduled: entry.scheduled,
    })),
    pageInfo: page.pageInfo,
  };
}

export async function listRecurringBillsTool(
  userId: string,
  args: Record<string, unknown>,
) {
  const { analysis } = await loadAnalyzed(userId, args);
  const status = optionalString(args, "status");
  return recurringBillsResponse(analysis, {
    includeUpcoming: args.includeUpcoming !== false,
    status:
      status === "paused" || status === "cancelled" || status === "any"
        ? status
        : "active",
    offset: optionalNumber(args, "offset"),
    limit: optionalNumber(args, "limit"),
  });
}

export async function getDebtSummaryTool(
  userId: string,
  args: Record<string, unknown>,
) {
  const { analysis } = await loadAnalyzed(userId, args);
  const carrying = await loadCarryingCost(
    userId,
    analysis.empty ? {} : { from: analysis.range.startKey, to: analysis.range.endKey },
  );
  if (analysis.empty) {
    return {
      range: null,
      series: [],
      latest: null,
      debtToAssetRatio: null,
      contributions: [],
      carryingCost: carrying,
    };
  }

  const latest = analysis.latest
    ? {
        key: analysis.latest.bucket.key,
        label: analysis.latest.bucket.label,
        startKey: analysis.latest.bucket.startKey,
        endKey: analysis.latest.bucket.endKey,
        assetCents: analysis.latest.assetCents,
        debtCents: analysis.latest.debtCents,
        netCents: analysis.latest.netCents,
      }
    : null;

  return {
    range: analysis.range,
    series: analysis.assetDebt.map((point) => ({
      key: point.bucket.key,
      label: point.bucket.label,
      startKey: point.bucket.startKey,
      endKey: point.bucket.endKey,
      assetCents: point.assetCents,
      debtCents: point.debtCents,
      netCents: point.netCents,
    })),
    latest,
    debtToAssetRatio: analysis.debtRatio,
    contributions: analysis.contributions,
    carryingCost: carrying,
  };
}

export async function searchTransactionsTool(
  userId: string,
  args: Record<string, unknown>,
) {
  const minCents = optionalNumber(args, "minCents");
  const maxCents = optionalNumber(args, "maxCents");
  if (minCents !== undefined && maxCents !== undefined && minCents > maxCents) {
    throw new AgentError(
      "validation",
      "minCents must be less than or equal to maxCents",
    );
  }

  const rows = await loadInsightsRows(userId);
  const flow = optionalString(args, "flow");
  const found = searchTransactions(rows, {
    query: optionalString(args, "query"),
    from: optionalString(args, "from"),
    to: optionalString(args, "to"),
    accountId: optionalString(args, "accountId"),
    category: optionalString(args, "category"),
    flow: flow as FinanceFlowKind | undefined,
    direction:
      args.direction === "income" || args.direction === "spend"
        ? args.direction
        : "any",
    minCents,
    maxCents,
  });

  const bounds = pageBounds(
    optionalNumber(args, "offset"),
    optionalNumber(args, "limit"),
  );
  const page = paginate(found.rows, bounds);
  return {
    transactions: page.items.map((row) => ({
      id: row.id,
      transactionDate: row.transactionDate,
      accountName: row.accountName,
      description: row.description,
      merchant: effectiveMerchant(row),
      amountCents: row.amountCents,
      category: effectiveCategory(row),
      flow: effectiveFlow(row),
    })),
    pageInfo: page.pageInfo,
    matchedIncomeCents: found.matchedIncomeCents,
    matchedSpendCents: found.matchedSpendCents,
    matchedNetCents: found.matchedNetCents,
  };
}

export async function listStatementsTool(
  userId: string,
  args: Record<string, unknown>,
) {
  const [statements, rows] = await Promise.all([
    listStatements(userId),
    loadInsightsRows(userId),
  ]);
  const report = reconcileAccounts(statements, rows);
  const checkById = new Map(report.statements.map((row) => [row.statementId, row]));
  const accountId = optionalString(args, "accountId");
  const from = optionalString(args, "from");
  const to = optionalString(args, "to");
  const holeKeys = new Set(
    report.holes.map((hole) => `${hole.accountId}:${hole.afterPeriodEnd}`),
  );

  const filtered = statements.filter((statement) => {
    if (accountId && statement.accountId !== accountId) return false;
    if (from && statement.periodEnd < from) return false;
    if (to && statement.periodStart > to) return false;
    return true;
  });

  const bounds = pageBounds(
    optionalNumber(args, "offset"),
    optionalNumber(args, "limit"),
  );
  const page = paginate(filtered, bounds);
  return {
    statements: page.items.map((statement) => {
      const check = checkById.get(statement.id);
      return {
        id: statement.id,
        accountId: statement.accountId,
        accountName: statement.accountName,
        periodStart: statement.periodStart,
        periodEnd: statement.periodEnd,
        openingBalanceCents: statement.openingBalanceCents,
        closingBalanceCents: statement.closingBalanceCents,
        paymentsCreditsCents: statement.paymentsCreditsCents,
        purchasesCents: statement.purchasesCents,
        registerSumCents: check?.registerSumCents ?? 0,
        registerDeltaCents: check?.registerDeltaCents ?? 0,
        rowCount: check?.rowCount ?? 0,
        holeAfter: holeKeys.has(`${statement.accountId}:${statement.periodEnd}`),
      };
    }),
    holes: report.holes.filter((hole) => !accountId || hole.accountId === accountId),
    pageInfo: page.pageInfo,
  };
}

function asStringList(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

async function writeOrConflict<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    // The bill write's refusals are all things the caller can fix by changing the call.
    if (
      error instanceof Error &&
      [
        "already belongs",
        "More than one bill has this name",
        "A bill needs a name",
        "needs its cost for the period",
      ].some((phrase) => error.message.includes(phrase))
    ) {
      throw new AgentError("validation", error.message);
    }
    throw error;
  }
}

/** Resolve the retired string-based tools at their boundary, then use stable payee ids. */
async function legacyPayeeIds(
  userId: string,
  matcherValues: readonly string[],
): Promise<string[]> {
  const payees = await listPayees(userId);
  const byAlias = new Map<string, PayeeRow>();
  for (const payee of payees) {
    for (const alias of payee.aliases) byAlias.set(alias, payee);
    const nameKey = normalizeMerchant(payee.name);
    if (nameKey !== "" && !byAlias.has(nameKey)) byAlias.set(nameKey, payee);
  }

  const ids: string[] = [];
  for (const raw of matcherValues) {
    const trimmed = raw.trim();
    const alias = normalizeMerchant(trimmed);
    if (alias === "") continue;
    let payee = byAlias.get(alias);
    if (!payee) {
      const id = await createPayee(userId, { name: trimmed, aliases: [alias] });
      payee = {
        id,
        name: trimmed,
        notes: "",
        autoCategoryMode: "learn",
        defaultBudgetCategoryId: null,
        defaultCategoryName: null,
        aliases: [alias],
        transactionCount: 0,
        totalCents: 0,
        claim: null,
      };
      byAlias.set(alias, payee);
    } else if (!payee.aliases.includes(alias)) {
      await addAlias(userId, payee.id, alias);
      payee.aliases.push(alias);
      byAlias.set(alias, payee);
    }
    ids.push(payee.id);
  }
  return [...new Set(ids)];
}

function legacyMatchers(
  payeeIds: readonly string[],
  payees: readonly PayeeRow[],
): string[] {
  const byId = new Map(payees.map((payee) => [payee.id, payee]));
  return [
    ...new Set(
      payeeIds.flatMap((id) => {
        const payee = byId.get(id);
        if (!payee) return [];
        return payee.aliases.length > 0
          ? payee.aliases
          : [normalizeMerchant(payee.name)].filter(Boolean);
      }),
    ),
  ].sort((left, right) => left.localeCompare(right));
}

export async function listCommitmentsTool(userId: string) {
  const [data, payees] = await Promise.all([loadDashboard(userId), listPayees(userId)]);
  const today = agentToday();
  return {
    bills: data.bills.map((bill) => {
      const last = data.billCharges
        .filter((charge) => charge.name === bill.name)
        .map((charge) => charge.dateKey)
        .sort()
        .at(-1);
      const annual =
        bill.expectedCents !== null
          ? annualCents(bill.expectedCents, cadenceOf(bill))
          : 0;
      return {
        name: bill.name,
        matchers: legacyMatchers(bill.payeeIds, payees),
        status: bill.status,
        cadence: cadenceLabel(cadenceOf(bill)),
        expectedCents: bill.expectedCents,
        annualCents: annual,
        // The Bills page's own answer. `anchorDate` is the predicted next charge, so walking
        // a cadence on from it skipped the date it names.
        nextDue:
          bill.scheduled && bill.status === "active"
            ? billAnchor(bill, last ?? null, today).nextDueKey
            : null,
        scheduled: bill.scheduled,
      };
    }),
  };
}

export async function listCommitmentCandidatesTool(userId: string) {
  const [data, analyzed] = await Promise.all([
    loadDashboard(userId),
    loadAnalyzed(userId, { window: "all" }),
  ]);
  const detected = analyzed.analysis.empty
    ? data.merchants
    : analyzed.analysis.recurring.map((entry) => entry.merchant);
  return {
    merchants: unclaimedMerchants(
      [...detected, ...data.merchants],
      data.bills.flatMap((bill) => bill.payees.map((payee) => payee.name)),
    ),
  };
}

export async function listPayeesTool(userId: string, args: Record<string, unknown>) {
  const query = (optionalString(args, "query") ?? "").trim().toLocaleLowerCase();
  const rows = (await listPayees(userId)).filter(
    (payee) =>
      query === "" ||
      payee.name.toLocaleLowerCase().includes(query) ||
      payee.aliases.some((alias) => alias.toLocaleLowerCase().includes(query)),
  );
  const page = paginate(
    rows,
    pageBounds(optionalNumber(args, "offset"), optionalNumber(args, "limit")),
  );
  return {
    payees: page.items.map((payee) => ({
      id: payee.id,
      name: payee.name,
      aliases: payee.aliases,
      claim: payee.claim ? { id: payee.claim.id, name: payee.claim.name } : null,
    })),
    pageInfo: page.pageInfo,
  };
}

export async function searchCommitmentsTool(
  userId: string,
  args: Record<string, unknown>,
) {
  const data = await loadDashboard(userId);
  const query = (optionalString(args, "query") ?? "").trim().toLocaleLowerCase();
  const rows = data.bills
    .map((bill) => ({
      id: bill.id,
      name: bill.name,
      payees: bill.payees.map((payee) => ({ ...payee })),
      active: bill.status === "active",
    }))
    .filter(
      (entry) =>
        query === "" ||
        entry.name.toLocaleLowerCase().includes(query) ||
        entry.payees.some((payee) => payee.name.toLocaleLowerCase().includes(query)),
    );
  const page = paginate(
    rows,
    pageBounds(optionalNumber(args, "offset"), optionalNumber(args, "limit")),
  );
  return { commitments: page.items, pageInfo: page.pageInfo };
}

export async function findCommitmentCandidatesTool(
  userId: string,
  args: Record<string, unknown>,
) {
  const data = await loadDashboard(userId);
  const query = (optionalString(args, "query") ?? "").trim().toLocaleLowerCase();
  const rows = data.review
    .filter((entry) => entry.payeeId !== null)
    .filter(
      (entry) => query === "" || entry.merchant.toLocaleLowerCase().includes(query),
    )
    .map((entry) => ({
      payeeId: entry.payeeId!,
      payeeName: entry.merchant,
      typicalCents: entry.typicalCents,
      chargeCount: entry.chargeCount,
    }));
  const page = paginate(
    rows,
    pageBounds(optionalNumber(args, "offset"), optionalNumber(args, "limit")),
  );
  return { candidates: page.items, pageInfo: page.pageInfo };
}

export async function saveSubscriptionTool(
  userId: string,
  args: Record<string, unknown>,
) {
  const id = optionalString(args, "id");
  let name = optionalString(args, "name");
  if (id === undefined && name === undefined) {
    throw new AgentError("validation", "Either id or name is required.");
  }
  if (name === undefined) {
    // An id-only correction keeps the bill's name; the write still wants one to validate.
    const existing = (await loadRecurringBills(userId)).find((bill) => bill.id === id);
    if (!existing) throw new AgentError("not_found", `Bill not found: ${id}`);
    name = existing.name;
  }
  const edit = {
    ...(id !== undefined ? { id } : {}),
    name,
    payeeIds: asStringList(args.payeeIds),
    cadence: cadenceFromArgs(args),
    expectedCents:
      args.expectedCents === null ? null : optionalNumber(args, "expectedCents"),
    anchorDate: args.anchorDate === null ? null : optionalString(args, "anchorDate"),
    status: optionalString(args, "status") as
      "active" | "paused" | "cancelled" | undefined,
    url: optionalString(args, "url"),
    scheduled: args.scheduled === undefined ? undefined : args.scheduled === true,
    dueDay: args.dueDay === null ? null : optionalNumber(args, "dueDay"),
    leadDays: optionalNumber(args, "leadDays"),
    notes: optionalString(args, "notes"),
    ...(args.cancelledOn !== undefined
      ? {
          cancelledOn:
            args.cancelledOn === null ? null : optionalString(args, "cancelledOn"),
        }
      : {}),
  };
  const billId = await writeOrConflict(() => upsertBillEnvelope(userId, edit));
  // By id, never by name: names repeat across groups, and a rename changes it.
  const row = (await loadRecurringBills(userId)).find((bill) => bill.id === billId);
  if (!row) throw new AgentError("not_found", "Saved bill was not found.");
  return {
    id: row.id,
    name: row.name,
    payees: row.payees.map((payee) => ({ ...payee })),
    status: row.status,
    cancelledOn: row.cancelledOn,
    cadence: cadenceLabel(cadenceOf(row)),
  };
}

/**
 * Hard-delete a bill added in error. Cancelling is the ordinary end of a bill and keeps it
 * as history; this is for a row that should never have existed.
 *
 * Reuses the envelope delete, which already does the related-row work the schema needs: it
 * releases payee claims and defaults, lets filed transactions fall back to unfiled (the FK is
 * `set null`), drops the envelope's allocations (cascade), and writes the audit event. The
 * `kind = 'bill'` check is here because that delete takes any envelope, and this tool must
 * not become a way to remove a spending or income envelope.
 */
export async function deleteSubscriptionTool(
  userId: string,
  args: Record<string, unknown>,
) {
  const id = optionalString(args, "id") ?? "";
  const bill = (await loadRecurringBills(userId)).find((row) => row.id === id);
  if (!bill) throw new AgentError("not_found", `Bill not found: ${id}`);
  await deleteBudgetCategory(userId, bill.id);
  return { deleted: true as const, id: bill.id, name: bill.name };
}

export async function setCommitmentPayeesTool(
  userId: string,
  args: Record<string, unknown>,
) {
  const id = optionalString(args, "id") ?? "";
  await replaceCommitmentPayees(userId, { id }, asStringList(args.payeeIds) ?? []);
  const data = await loadDashboard(userId);
  const row = data.bills
    .map((bill) => ({
      id: bill.id,
      name: bill.name,
      payees: bill.payees.map((payee) => ({ ...payee })),
      active: bill.status === "active",
    }))
    .find((entry) => entry.id === id);
  if (!row) throw new AgentError("not_found", "Commitment not found.");
  return { commitment: row };
}

/**
 * The cadence an agent asked for, or undefined when it named none. Days win over months,
 * matching the column rule.
 *
 * Undefined rather than a monthly default is the point: the write leaves an existing bill's
 * cadence alone when told nothing, so correcting a status or a name cannot reset a 30-day
 * bill to monthly. A new bill still gets monthly, from the write itself.
 */
function cadenceFromArgs(args: Record<string, unknown>): Cadence | undefined {
  const days = args.cadenceDays === null ? null : optionalNumber(args, "cadenceDays");
  if (days !== undefined && days !== null && days > 0) return { unit: "day", n: days };
  const months = optionalNumber(args, "cadenceMonths");
  if (months !== undefined) return { unit: "month", n: months };
  if (days === null) {
    throw new AgentError(
      "validation",
      "cadenceDays: null needs cadenceMonths to say which month cadence replaces it.",
    );
  }
  return undefined;
}

export async function upsertSubscriptionTool(
  userId: string,
  args: Record<string, unknown>,
) {
  const name = optionalString(args, "name") ?? "";
  const requestedMatchers = asStringList(args.matchers);
  const payeeIds =
    requestedMatchers === undefined
      ? undefined
      : await legacyPayeeIds(userId, requestedMatchers);
  await writeOrConflict(() =>
    upsertBillEnvelope(userId, {
      name,
      payeeIds,
      cadence: cadenceFromArgs(args),
      expectedCents:
        args.expectedCents === null ? null : optionalNumber(args, "expectedCents"),
      anchorDate: args.anchorDate === null ? null : optionalString(args, "anchorDate"),
      status: optionalString(args, "status") as
        "active" | "paused" | "cancelled" | undefined,
      url: optionalString(args, "url"),
      scheduled: args.scheduled === undefined ? undefined : args.scheduled === true,
      dueDay: args.dueDay === null ? null : optionalNumber(args, "dueDay"),
      leadDays: optionalNumber(args, "leadDays"),
      notes: optionalString(args, "notes"),
    }),
  );
  const [row] = (await loadRecurringBills(userId)).filter(
    (bill) => bill.name === name.trim(),
  );
  const payees = await listPayees(userId);
  return {
    name: row?.name ?? name.trim(),
    matchers: row ? legacyMatchers(row.payeeIds, payees) : [],
    status: row?.status ?? "active",
  };
}
