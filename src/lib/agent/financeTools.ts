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
  type DateRange,
} from "@/lib/finances/analytics";
import {
  loadCarryingCost,
  loadInsightsRows,
  loadRecurringBills,
  unclassifiedCount,
} from "@/lib/finances/dashboardQueries";
import { analyzeInsights } from "@/lib/finances/insightsAnalysis";
import {
  insightsFilterOptions,
  type InsightsReportFilter,
  type InsightsWindowKey,
} from "@/lib/finances/insightsFilter";
import { listAccounts, listStatements } from "@/lib/finances/queries";
import { reconcileAccounts } from "@/lib/finances/reconcile";
import { searchTransactions } from "@/lib/finances/transactionSearch";
import { localDateKey } from "@/lib/metrics/parse";
import type { InsightsAxis } from "@/lib/settings/finances";
import type { FinanceFlowKind } from "@/db/schema";
import { AgentError } from "./errors";
import { optionalNumber, optionalString } from "./parse";
import { pageBounds, paginate } from "./pagination";

const EMPTY_INCOME = {
  paycheckMonthlyCents: 0,
  otherMonthlyCents: 0,
  totalMonthlyCents: 0,
  medianPaycheckCents: 0,
  paydayCount: 0,
};

const EMPTY_BASELINE = {
  baselineCents: 0,
  oneOffCents: 0,
  baselinePerBucketCents: 0,
  bucketCount: 0,
  events: [] as { label: string; cents: number; count: number }[],
  levelled: false,
  billsCents: 0,
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
  const [rows, bills] = await Promise.all([
    loadInsightsRows(userId),
    loadRecurringBills(userId),
  ]);
  const analysis = analyzeInsights(rows, bills, {
    filter: parsed.filter,
    window: parsed.window,
    axis: parsed.axis,
    levelRecurring: parsed.levelRecurring,
    today: localDateKey(),
    range: explicitRange(parsed, rowsRange(rows)),
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
  trailingSpendCents: number | null;
  trailingIncomeCents: number | null;
  trailingNetCents: number | null;
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
    trailingSpendCents: point.trailingSpendCents,
    trailingIncomeCents: point.trailingIncomeCents,
    trailingNetCents: point.trailingNetCents,
  };
}

export async function getFinanceOverviewTool(userId: string) {
  const [accounts, rows, unclassified, carrying, statements] = await Promise.all([
    listAccounts(userId),
    loadInsightsRows(userId),
    unclassifiedCount(userId),
    loadCarryingCost(userId),
    listStatements(userId),
  ]);
  const history = rowsRange(rows);
  const options = insightsFilterOptions(rows);
  return {
    accounts: accounts.map((account) => ({
      id: account.id,
      name: account.name,
      kind: account.kind,
      institution: account.institution,
      balanceCents: account.balanceCents,
      ledgerBalanceCents: account.ledgerBalanceCents,
      statementClosingCents: account.statementClosingCents,
      statementPeriodEnd: account.statementPeriodEnd,
      mismatchCents: account.balanceMismatchCents,
      transactionCount: account.transactionCount,
      closedAt: account.closedAt ? account.closedAt.toISOString() : null,
    })),
    history: {
      startKey: history?.startKey ?? null,
      endKey: history?.endKey ?? null,
      transactionCount: rows.length,
    },
    unclassifiedCount: unclassified,
    coverage: coverageGap(rows, statements),
    categories: options.categories,
    merchants: options.merchants,
    carryingCost: {
      interestCents: carrying.interestCents,
      feesCents: carrying.feesCents,
    },
  };
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
      },
      income: EMPTY_INCOME,
      baseline: EMPTY_BASELINE,
    };
  }

  const totals = analysis.flow.reduce(
    (sum, point) => ({
      incomeCents: sum.incomeCents + point.incomeCents,
      spendCents: sum.spendCents + point.spendCents,
      fixedCents: sum.fixedCents + point.fixedCents,
      variableCents: sum.variableCents + point.variableCents,
      netCents: sum.netCents + point.netCents,
    }),
    {
      incomeCents: 0,
      spendCents: 0,
      fixedCents: 0,
      variableCents: 0,
      netCents: 0,
    },
  );

  return {
    range: analysis.range,
    axis: parsed.axis,
    window: parsed.from || parsed.to ? "custom" : parsed.window,
    levelRecurring: parsed.levelRecurring,
    points: analysis.flow.map(flattenFlowPoint),
    totals,
    income: analysis.income,
    baseline: {
      baselineCents: analysis.split.baselineCents,
      oneOffCents: analysis.split.oneOffCents,
      baselinePerBucketCents: analysis.split.baselinePerBucketCents,
      bucketCount: analysis.split.bucketCount,
      events: analysis.split.events,
      levelled: analysis.split.levelled,
      billsCents: analysis.split.billsCents,
    },
  };
}

export async function getSpendingBreakdownTool(
  userId: string,
  args: Record<string, unknown>,
) {
  const { analysis } = await loadAnalyzed(userId, args);
  const by = args.by === "merchant" ? "merchant" : "category";
  const limit = Math.min(Math.max(optionalNumber(args, "limit") ?? 20, 1), 100);
  if (analysis.empty) {
    return {
      range: null,
      by,
      items: [],
      totalSpendCents: 0,
      otherCents: 0,
      returned: 0,
      total: 0,
      ...(args.trend === true ? { trends: [] } : {}),
    };
  }

  const ranked =
    by === "merchant"
      ? analysis.payees.map((entry) => ({
          name: entry.merchant,
          cents: entry.cents,
          share: entry.share,
          count: entry.count,
        }))
      : analysis.categories.map((entry) => ({
          name: entry.category,
          cents: entry.cents,
          share: entry.share,
          count: entry.count,
        }));
  const items = ranked.slice(0, limit);
  const otherCents = ranked
    .slice(limit)
    .reduce((total, entry) => total + entry.cents, 0);
  const totalSpendCents = ranked.reduce((total, entry) => total + entry.cents, 0);

  return {
    range: analysis.range,
    by,
    items,
    totalSpendCents,
    otherCents,
    returned: items.length,
    total: ranked.length,
    ...(args.trend === true
      ? {
          trends: analysis.trends.points.map((point) => ({
            key: point.bucket.key,
            label: point.bucket.label,
            startKey: point.bucket.startKey,
            endKey: point.bucket.endKey,
            byName: point.byCategory,
          })),
        }
      : {}),
  };
}

export async function listRecurringBillsTool(
  userId: string,
  args: Record<string, unknown>,
) {
  const { analysis } = await loadAnalyzed(userId, args);
  if (analysis.empty) {
    return { range: null, bills: [], annualTotalCents: 0, upcoming: [] };
  }
  return {
    range: analysis.range,
    bills: analysis.recurring.map((entry) => ({
      merchant: entry.merchant,
      typicalCents: entry.typicalCents,
      lowCents: entry.lowCents,
      highCents: entry.highCents,
      deviationCents: entry.deviationCents,
      chargeCount: entry.chargeCount,
      cadenceDays: entry.cadenceDays,
      cadenceMonths: entry.cadenceMonths,
      annualCents: entry.annualCents,
      lastChargeOn: entry.lastChargeOn,
      declared: entry.declared,
      scheduled: entry.scheduled,
    })),
    annualTotalCents: analysis.recurring.reduce(
      (total, entry) => total + entry.annualCents,
      0,
    ),
    upcoming: args.includeUpcoming === false ? [] : analysis.upcoming,
  };
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
      excludeFromBaseline: row.excludeFromBaseline,
      eventLabel: row.eventLabel,
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
