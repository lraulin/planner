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
  loadDashboard,
  loadInsightsRows,
  loadRecurringBills,
  loadRecurringSpend,
  unclassifiedCount,
} from "@/lib/finances/dashboardQueries";
import {
  MatcherConflictError,
  recurringSpendRate,
  unclaimedMerchants,
} from "@/lib/finances/commitments";
import { annualCents, nextDueFrom } from "@/lib/finances/recurringBills";
import {
  deleteCommitment,
  upsertRecurringBill,
  upsertRecurringSpend,
} from "@/lib/finances/mutations";
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
    today: localDateKey(),
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
        externalTransferCents: 0,
        statementNetCents: null,
        residualCents: null,
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

function asStringList(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

async function writeOrConflict<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof MatcherConflictError) {
      throw new AgentError("validation", error.message);
    }
    throw error;
  }
}

export async function listCommitmentsTool(userId: string) {
  const data = await loadDashboard(userId);
  const today = localDateKey();
  return {
    bills: data.bills.map((bill) => {
      const last = data.billCharges
        .filter((charge) => charge.name === bill.name)
        .map((charge) => charge.dateKey)
        .sort()
        .at(-1);
      const anchor = last ?? bill.anchorDate;
      const annual =
        bill.expectedCents !== null
          ? annualCents(bill.expectedCents, bill.cadenceMonths)
          : 0;
      return {
        name: bill.name,
        matchers: [...bill.matchers],
        status: bill.status,
        cadenceMonths: bill.cadenceMonths,
        expectedCents: bill.expectedCents,
        annualCents: annual,
        nextDue:
          bill.scheduled && bill.status === "active" && anchor !== null
            ? nextDueFrom(anchor, bill.cadenceMonths, today)
            : null,
        scheduled: bill.scheduled,
        setAside: bill.setAside,
      };
    }),
    spend: data.spend.map((entry) => {
      const rate = recurringSpendRate(
        entry,
        data.spendCharges.get(entry.name) ?? [],
        today,
      );
      return {
        name: entry.name,
        matchers: [...entry.matchers],
        period: entry.period,
        amountSource: entry.amountSource,
        ratePerPeriodCents: rate.ratePerPeriodCents,
        observedCents: rate.observedCents,
        setAside: entry.setAside,
        active: entry.active,
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
      data.bills,
      data.spend,
    ),
  };
}

export async function upsertSubscriptionTool(
  userId: string,
  args: Record<string, unknown>,
) {
  const name = optionalString(args, "name") ?? "";
  await writeOrConflict(() =>
    upsertRecurringBill(userId, {
      name,
      matchers: asStringList(args.matchers),
      cadenceMonths: optionalNumber(args, "cadenceMonths") ?? 1,
      expectedCents:
        args.expectedCents === null ? null : optionalNumber(args, "expectedCents"),
      anchorDate: args.anchorDate === null ? null : optionalString(args, "anchorDate"),
      status: optionalString(args, "status") as
        "active" | "cancelled" | "ignored" | undefined,
      cancelUrl: optionalString(args, "cancelUrl"),
      scheduled: args.scheduled === undefined ? undefined : args.scheduled === true,
      setAside: args.setAside === undefined ? undefined : args.setAside === true,
      dueDay: args.dueDay === null ? null : optionalNumber(args, "dueDay"),
      notes: optionalString(args, "notes"),
    }),
  );
  const [row] = (await loadRecurringBills(userId)).filter(
    (bill) => bill.name === name.trim(),
  );
  return {
    name: row?.name ?? name.trim(),
    matchers: row ? [...row.matchers] : [],
    status: row?.status ?? "active",
  };
}

export async function upsertRecurringSpendTool(
  userId: string,
  args: Record<string, unknown>,
) {
  const name = optionalString(args, "name") ?? "";
  await writeOrConflict(() =>
    upsertRecurringSpend(userId, {
      name,
      matchers: asStringList(args.matchers),
      period: optionalString(args, "period") as "week" | "month" | undefined,
      amountSource: optionalString(args, "amountSource") as
        "auto" | "pinned" | undefined,
      expectedCents:
        args.expectedCents === null ? null : optionalNumber(args, "expectedCents"),
      setAside: args.setAside === undefined ? undefined : args.setAside === true,
      active: args.active === undefined ? undefined : args.active === true,
      notes: optionalString(args, "notes"),
    }),
  );
  const [row] = (await loadRecurringSpend(userId)).filter(
    (entry) => entry.name === name.trim(),
  );
  return {
    name: row?.name ?? name.trim(),
    matchers: row ? [...row.matchers] : [],
    period: row?.period ?? "week",
  };
}

export async function deleteCommitmentTool(
  userId: string,
  args: Record<string, unknown>,
) {
  const kind = optionalString(args, "kind");
  const name = optionalString(args, "name") ?? "";
  if (kind !== "bill" && kind !== "spend") {
    throw new AgentError("validation", "kind must be bill or spend");
  }
  await deleteCommitment(userId, { kind, name });
  return { deleted: true as const, kind, name };
}
