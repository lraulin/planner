import { and, asc, eq, gte, isNotNull, notInArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  financeAccounts,
  financeBudgetAllocations,
  financeBudgetCategories,
  financeBudgetMonths,
  financeCategoryGroups,
  financeTransactions,
} from "@/db/schema";
import type { EnvelopeKind, EnvelopeStatus } from "@/db/schema";
import { readSetting } from "@/lib/settings/queries";
import { BUDGET_SCOPE } from "@/lib/settings/scopes";
import { parseBudget, type BudgetSettings } from "@/lib/settings/finances";
import { localDateKey } from "@/lib/schedule/geometry";
import { accountPoolCents } from "../accountPool";
import type { FinanceExecutor } from "../dbExecutor";
import { numericStringToCents } from "../money";
import { listAccounts } from "../queries";
import { accountBalanceView } from "../workingBalance";
import { loadWorkingPendingSelection } from "../workingPendingQuery";
import { lastChargeByEnvelope } from "../billLastCharge";
import { billAnchor, type BillAnchor } from "../commitments";
import type { StoredBill } from "../recurringBills";
import { walksNextDue } from "./inspector";
import {
  buildBudget,
  findMonth,
  monthEndKey,
  monthKeyOf,
  shiftMonthKey,
  type BudgetMonth,
  type MonthKey,
} from "./envelope";
import { parseNullableTargetOrThrow, type Target } from "./targets/types";
import { budgetEnvelopeLabel } from "./hierarchy";
import type { BillSnapshot } from "./targets/derive";
import { ASSIGN_AVERAGE_MONTHS } from "./assign/types";
import type { ActivityPoint } from "./assign/fromBudget";
import { moneyRows } from "../splitRows";
import { budgetContributionSql } from "./contributionSql";
import { listBudgetMovementAudit } from "../audit/queries";

/**
 * Reads for the envelope budget. Every one takes `userId` and scopes on it.
 *
 * **Activity is aggregated in SQL; everything else is derived in `envelope.ts`.** That split
 * is deliberate and mirrors Actual's `getSumAmountsByMonth` — the rollup is one `GROUP BY`
 * over an unbounded table, and the fold that turns it into balances is the part where a wrong
 * answer looks plausible, so it belongs in a pure module with tests rather than in SQL.
 *
 * Spec: `agent-os/specs/2026-08-22-1948-zero-based-budget/`.
 */

/** How far past the current month the fold runs, so next year's bills can be funded early. */
export const BUDGET_HORIZON_MONTHS = 12;

/** The window "set to average" offers, and the history the query therefore has to reach. */
export const AVERAGE_LOOKBACK_MONTHS = 3;

export type BudgetGroupRow = {
  id: string;
  parentGroupId: string | null;
  name: string;
  /** Which budget table this group is in. Stored, not derived from its envelopes (D1). */
  kind: EnvelopeKind;
  sortKey: string;
  hidden: boolean;
};

/** The bill facet of an envelope — meaningful only when `kind === "bill"`. */
export type BillFacet = {
  status: EnvelopeStatus;
  cancelledOn: string | null;
  url: string;
  cadenceMonths: number | null;
  cadenceDays: number | null;
  dueDay: number | null;
  /** Days before the due date the charge posts. Zero unless `dueDay` is declared. */
  leadDays: number;
  anchorDate: string | null;
  scheduled: boolean;
  expectedCents: number | null;
};

export type BudgetCategoryRow = {
  id: string;
  groupId: string | null;
  name: string;
  sortKey: string;
  hidden: boolean;
  notes: string;
  kind: EnvelopeKind;
  /** Derived from `kind` — income has no allocation and no balance. */
  isIncome: boolean;
  bill: BillFacet | null;
  target: Target | null;
  incomeRole: "regular" | "other";
  expectedMonthlyIncomeCents: number | null;
};

export type BudgetEnvelopeOption = {
  id: string;
  /** Group path, for pickers that need to tell two envelopes with the same leaf name apart. */
  label: string;
  /** Envelope's own name — what the register Category column stores. */
  name: string;
  kind: EnvelopeKind;
  groupId: string | null;
  sortKey: string;
  hidden: boolean;
};

export type BudgetEnvelopeCatalog = {
  groups: BudgetGroupRow[];
  envelopes: BudgetEnvelopeOption[];
};

/** Small catalog read for Register Category and Payees auto-category. */
export async function listBudgetEnvelopeOptions(
  userId: string,
): Promise<BudgetEnvelopeCatalog> {
  const [groups, categories] = await Promise.all([
    groupsOf(userId),
    categoriesOf(userId),
  ]);
  return {
    groups,
    envelopes: categories.map((category) => ({
      id: category.id,
      label: budgetEnvelopeLabel(groups, category),
      name: category.name,
      kind: category.kind,
      groupId: category.groupId,
      sortKey: category.sortKey,
      hidden: category.hidden,
    })),
  };
}

export type BudgetData = {
  /** False until setup has run. The page shows the preset chooser and nothing else. */
  configured: boolean;
  settings: BudgetSettings;
  groups: BudgetGroupRow[];
  categories: BudgetCategoryRow[];
  /** Every month from the start to the horizon, in order. Empty when unconfigured. */
  months: BudgetMonth[];
  /** The month being shown, clamped into the folded range. */
  month: MonthKey;
  /** Today, so the pure operations can date their movement lines without an ambient clock. */
  todayKey: string;
  /**
   * Signed sum of on-budget working balances right now — the same pending selection and
   * headline anchoring the Dashboard uses. Current Ready to Assign reconciles to this.
   */
  accountPoolCents: number;
  /** On-budget rows since the start month with no envelope: the size of the backlog. */
  uncategorizedCount: number;
  uncategorizedCents: number;
  /**
   * Template goals written by Apply / Overwrite, keyed `month|categoryId`.
   * Absent means no goal for that cell.
   */
  goals: Record<string, number>;
  /**
   * What setup would actually seed "funds from last month" with — the position at the end of
   * *last* month, not today's.
   *
   * A separate field from `accountPoolCents` because the two genuinely differ by this
   * month's activity so far, and the setup screen names a figure the user then sees again as
   * their first Ready to Assign. Showing today's position there and seeding last month's is
   * the exact failure `2026-08-18-2058-commitments-clarity` was written about: the decision
   * surface reporting a different number than the system uses. Zero once configured, where
   * the recorded `settings.openingCents` is the answer.
   */
  prospectiveOpeningCents: number;
  /** Canonical immutable finance-audit entries for the selected month, newest first. */
  movementEvents: { id: string; occurredAt: Date; summary: string }[];
  /**
   * Categorised activity in the 12 months before `startMonth`. Assigned is not stored
   * there; Average Spent / Spent Last Month still need the spend.
   */
  preStartActivity: ActivityPoint[];
};

function groupsOf(userId: string, executor: FinanceExecutor = db) {
  return executor
    .select({
      id: financeCategoryGroups.id,
      parentGroupId: financeCategoryGroups.parentGroupId,
      name: financeCategoryGroups.name,
      kind: financeCategoryGroups.kind,
      sortKey: financeCategoryGroups.sortKey,
      hidden: financeCategoryGroups.hidden,
    })
    .from(financeCategoryGroups)
    .where(eq(financeCategoryGroups.userId, userId))
    .orderBy(asc(financeCategoryGroups.name));
}

function categoriesOf(userId: string, executor: FinanceExecutor = db) {
  return executor
    .select({
      id: financeBudgetCategories.id,
      groupId: financeBudgetCategories.groupId,
      name: financeBudgetCategories.name,
      sortKey: financeBudgetCategories.sortKey,
      hidden: financeBudgetCategories.hidden,
      notes: financeBudgetCategories.notes,
      target: financeBudgetCategories.target,
      incomeRole: financeBudgetCategories.incomeRole,
      expectedMonthlyIncomeCents: financeBudgetCategories.expectedMonthlyIncomeCents,
      kind: financeBudgetCategories.kind,
      status: financeBudgetCategories.status,
      cancelledOn: financeBudgetCategories.cancelledOn,
      url: financeBudgetCategories.url,
      cadenceMonths: financeBudgetCategories.cadenceMonths,
      cadenceDays: financeBudgetCategories.cadenceDays,
      dueDay: financeBudgetCategories.dueDay,
      leadDays: financeBudgetCategories.leadDays,
      anchorDate: financeBudgetCategories.anchorDate,
      scheduled: financeBudgetCategories.scheduled,
      expectedCents: financeBudgetCategories.expectedCents,
    })
    .from(financeBudgetCategories)
    .where(eq(financeBudgetCategories.userId, userId))
    .orderBy(asc(financeBudgetCategories.name));
}

function parsedCategories(
  rows: Awaited<ReturnType<typeof categoriesOf>>,
): BudgetCategoryRow[] {
  return rows.map((row) => ({
    id: row.id,
    groupId: row.groupId,
    name: row.name,
    sortKey: row.sortKey,
    hidden: row.hidden,
    notes: row.notes,
    target: parseNullableTargetOrThrow(row.target),
    incomeRole: row.incomeRole,
    expectedMonthlyIncomeCents: row.expectedMonthlyIncomeCents,
    kind: row.kind,
    isIncome: row.kind === "income",
    bill:
      row.kind === "bill"
        ? {
            status: row.status,
            cancelledOn: row.cancelledOn,
            url: row.url,
            cadenceMonths: row.cadenceMonths,
            cadenceDays: row.cadenceDays,
            dueDay: row.dueDay,
            leadDays: row.leadDays,
            anchorDate: row.anchorDate,
            scheduled: row.scheduled,
            expectedCents: row.expectedCents,
          }
        : null,
  }));
}

/** Retained feed rows remain auditable in Register, but are not a second copy of the money. */
function notSupersededPending(ids: readonly string[]) {
  return ids.length > 0 ? notInArray(financeTransactions.id, [...ids]) : undefined;
}

/**
 * Signed sum per envelope per month, over on-budget accounts, from `since` forward.
 *
 * **Transfers between two on-budget accounts are excluded**, and that exclusion is the one
 * subtle line in this file. A card payment moves money inside the budget and spends none of
 * it; if only one of its two legs carried an envelope the budget would record a purchase that
 * never happened. Actual gets this for free because it never puts a category on a transfer;
 * we enforce it here as well as in the auto-map, because the Register lets a person set an
 * envelope on any row.
 *
 * A transfer to an **off-budget** account is deliberately still counted — money left the
 * pool once. Checking↔savings and a card payment between two on-budget accounts are not
 * activity; they only change where the money sits.
 */
async function activitySince(
  userId: string,
  since: MonthKey,
  supersededPendingIds: readonly string[],
  executor: FinanceExecutor = db,
) {
  const rows = await executor
    .select({
      month: sql<string>`to_char(date_trunc('month', ${financeTransactions.transactionDate}), 'YYYY-MM-DD')`,
      categoryId: financeTransactions.budgetCategoryId,
      amount: sql<string>`sum(${financeTransactions.amount})`,
    })
    .from(financeTransactions)
    .innerJoin(financeAccounts, eq(financeAccounts.id, financeTransactions.accountId))
    .where(
      and(
        budgetContributionSql(userId, supersededPendingIds),
        isNotNull(financeTransactions.budgetCategoryId),
        gte(financeTransactions.transactionDate, since),
      ),
    )
    .groupBy(sql`1`, financeTransactions.budgetCategoryId);

  return rows.map((row) => ({
    month: row.month,
    categoryId: row.categoryId as string,
    amountCents: numericStringToCents(row.amount) ?? 0,
  }));
}

/**
 * On-budget rows since `since` that nothing has put in an envelope yet.
 *
 * The count feeds the Budget card's uncategorized line and the sum is Ready to Assign's
 * `Uncategorized activity` term, so both come from one predicate: what the tray offers to
 * categorize is exactly what the term names. There is deliberately **no upper date bound** —
 * a future-dated uncategorized row is in the working pool
 * (`workingBalance.ts` bounds no pending row), so bounding the term at the current month end
 * would push it into `Account reconciliation`, which is the residual and cannot be clicked.
 */
async function backlogSince(
  userId: string,
  since: MonthKey,
  supersededPendingIds: readonly string[],
  executor: FinanceExecutor = db,
) {
  const [row] = await executor
    .select({
      count: sql<number>`count(*)::int`,
      amount: sql<string>`coalesce(sum(${financeTransactions.amount}), 0)`,
    })
    .from(financeTransactions)
    .innerJoin(financeAccounts, eq(financeAccounts.id, financeTransactions.accountId))
    .where(
      and(
        budgetContributionSql(userId, supersededPendingIds),
        sql`${financeTransactions.budgetCategoryId} is null`,
        gte(financeTransactions.transactionDate, since),
      ),
    );

  return {
    uncategorizedCount: row?.count ?? 0,
    uncategorizedCents: numericStringToCents(row?.amount ?? "0") ?? 0,
  };
}

/**
 * Everything the Budget page needs for one month.
 *
 * `requestedMonth` is clamped into the folded range rather than rejected: a stale link to a
 * month before the budget existed should land on the first real one, not on an error.
 */
export async function loadBudget(
  userId: string,
  requestedMonth: MonthKey | null,
  executor: FinanceExecutor = db,
  options: { includeMovementEvents?: boolean; todayKey?: string } = {},
): Promise<BudgetData> {
  const todayKey = options.todayKey ?? localDateKey(new Date());
  const currentMonth = monthKeyOf(todayKey);

  const [stored, groups, categoryRows, accounts] = await Promise.all([
    readSetting(userId, BUDGET_SCOPE, executor),
    groupsOf(userId, executor),
    categoriesOf(userId, executor),
    listAccounts(userId, executor),
  ]);
  const categories = parsedCategories(categoryRows);

  const settings = parseBudget(stored);
  const pending = await loadWorkingPendingSelection(userId, accounts, executor);
  const poolCents = accountPoolCents(accounts, pending.rows);

  const empty: BudgetData = {
    configured: false,
    settings,
    groups,
    categories,
    months: [],
    month: currentMonth,
    todayKey,
    accountPoolCents: poolCents,
    uncategorizedCount: 0,
    uncategorizedCents: 0,
    goals: {},
    prospectiveOpeningCents: 0,
    movementEvents: [],
    preStartActivity: [],
  };

  const startMonth = settings.startMonth;
  if (!startMonth) {
    return {
      ...empty,
      prospectiveOpeningCents: await openingPositionFor(
        userId,
        currentMonth,
        undefined,
        executor,
      ),
    };
  }

  const endMonth = shiftMonthKey(
    currentMonth > startMonth ? currentMonth : startMonth,
    BUDGET_HORIZON_MONTHS,
  );

  const [allocations, bufferedRows, activity, backlog] = await Promise.all([
    executor
      .select({
        month: financeBudgetAllocations.month,
        categoryId: financeBudgetAllocations.categoryId,
        amountCents: financeBudgetAllocations.amountCents,
        carryover: financeBudgetAllocations.carryover,
        snoozed: financeBudgetAllocations.snoozed,
        goalCents: financeBudgetAllocations.goalCents,
      })
      .from(financeBudgetAllocations)
      .where(eq(financeBudgetAllocations.userId, userId)),
    executor
      .select({
        month: financeBudgetMonths.month,
        bufferedCents: financeBudgetMonths.bufferedCents,
      })
      .from(financeBudgetMonths)
      .where(eq(financeBudgetMonths.userId, userId)),
    activitySince(
      userId,
      shiftMonthKey(startMonth, -ASSIGN_AVERAGE_MONTHS),
      pending.supersededTransactionIds,
      executor,
    ),
    backlogSince(userId, startMonth, pending.supersededTransactionIds, executor),
  ]);
  const foldActivity = activity.filter((row) => row.month >= startMonth);
  const preStartActivity = activity.filter((row) => row.month < startMonth);

  const months = buildBudget({
    categories: categories.map((category) => ({
      id: category.id,
      groupId: category.groupId,
      isIncome: category.kind === "income",
    })),
    allocations: allocations.map((row) => ({
      month: row.month,
      categoryId: row.categoryId,
      amountCents: row.amountCents,
      carryover: row.carryover,
      snoozed: row.snoozed,
    })),
    activity: foldActivity,
    buffered: bufferedRows,
    startMonth,
    endMonth,
    openingCents: settings.openingCents,
    current:
      currentMonth >= startMonth
        ? {
            month: currentMonth,
            accountPoolCents: poolCents,
            uncategorizedActivityCents: backlog.uncategorizedCents,
          }
        : undefined,
  });

  const goals: Record<string, number> = {};
  for (const row of allocations) {
    if (row.goalCents != null) {
      goals[`${row.month}|${row.categoryId}`] = row.goalCents;
    }
  }

  const wanted = requestedMonth ?? currentMonth;
  const month = findMonth(months, wanted)
    ? wanted
    : (months.find((entry) => entry.month >= wanted)?.month ??
      months[months.length - 1]?.month ??
      currentMonth);
  const movementEvents =
    options.includeMovementEvents === false
      ? []
      : await listBudgetMovementAudit(userId, month, executor);

  return {
    ...empty,
    configured: true,
    months,
    month,
    goals,
    movementEvents,
    ...backlog,
    preStartActivity,
  };
}

/**
 * The on-budget position on the day before `month` began — the fold's opening figure.
 *
 * Recorded once at setup rather than recomputed on every load, so importing an old statement
 * cannot silently move last month's Ready to Assign
 * (`agent-os/specs/2026-08-22-1948-zero-based-budget/` D2). Uses the same working balances
 * and pending selection as the Dashboard, then walks back over rows after that day.
 *
 * Pass `accountIds` to measure one account (membership rebase) rather than the whole pool.
 */
export async function openingPositionFor(
  userId: string,
  month: MonthKey,
  accountIds?: readonly string[],
  executor: FinanceExecutor = db,
): Promise<number> {
  const asOfKey = monthEndKey(shiftMonthKey(month, -1));
  const allAccounts = await listAccounts(userId, executor);
  const accounts = allAccounts.filter((account) =>
    accountIds ? accountIds.includes(account.id) : !account.offBudget,
  );
  if (accounts.length === 0) return 0;

  const pending = await loadWorkingPendingSelection(userId, allAccounts, executor);
  const known = new Set(accounts.map((account) => account.id));

  const rows = await executor
    .select({
      accountId: financeTransactions.accountId,
      amount: financeTransactions.amount,
    })
    .from(financeTransactions)
    .innerJoin(financeAccounts, eq(financeAccounts.id, financeTransactions.accountId))
    .where(
      and(
        eq(financeTransactions.userId, userId),
        eq(financeAccounts.userId, userId),
        // Money: leaves, so that splitting a row after `asOfKey` cannot move the balance.
        moneyRows,
        notSupersededPending(pending.supersededTransactionIds),
        sql`${financeTransactions.transactionDate} > ${asOfKey}`,
      ),
    );

  const after = rows.reduce(
    (total, row) =>
      known.has(row.accountId)
        ? total + (numericStringToCents(row.amount) ?? 0)
        : total,
    0,
  );

  const working = accounts.reduce(
    (total, account) => total + accountBalanceView(account, pending.rows).workingCents,
    0,
  );
  return working - after;
}

function storedBillOf(category: BudgetCategoryRow): StoredBill | null {
  if (category.kind !== "bill" || !category.bill) return null;
  if (category.bill.cadenceMonths === null) return null;
  return {
    name: category.name,
    cadenceMonths: category.bill.cadenceMonths,
    cadenceDays: category.bill.cadenceDays,
    anchorDate: category.bill.anchorDate,
    expectedCents: category.bill.expectedCents,
    scheduled: category.bill.scheduled,
    dueDay: category.bill.dueDay,
    leadDays: category.bill.leadDays,
  };
}

/**
 * Next charge per scheduled bill envelope, except cancelled.
 *
 * Distinct from {@link loadBillSnapshots}: apply only funds active bills that state an
 * amount, and deriving the grid column from that list left paused bills (and bills with
 * no amount yet) showing "—" with nothing to edit. Cancelled keeps stored `anchorDate`
 * so reactivate restores the walk; it does not grow a next-due key while cancelled.
 */
export async function loadBillAnchors(
  userId: string,
  categories: readonly BudgetCategoryRow[],
  todayKey: string,
): Promise<Map<string, BillAnchor>> {
  const lastCharge = await lastChargeByEnvelope(userId);
  const anchors = new Map<string, BillAnchor>();

  for (const category of categories) {
    const bill = storedBillOf(category);
    if (bill === null || category.bill === null || !walksNextDue(category.bill)) {
      continue;
    }
    anchors.set(
      category.id,
      billAnchor(bill, lastCharge.get(category.id) ?? null, todayKey),
    );
  }

  return anchors;
}

export async function loadNextDueKeys(
  userId: string,
  categories: readonly BudgetCategoryRow[],
  todayKey: string,
): Promise<Map<string, string>> {
  const anchors = await loadBillAnchors(userId, categories, todayKey);
  return new Map(
    [...anchors].flatMap(([id, anchor]) =>
      anchor.nextDueKey === null ? [] : [[id, anchor.nextDueKey] as const],
    ),
  );
}

/**
 * Every active bill envelope reduced to what the apply engine needs, as of `todayKey`.
 *
 * The budget page reads these alongside the budget so the template drawer can preview this
 * month's demand by running the same pure engine the server runs — not a second guess at it.
 * Paused and cancelled bills are excluded: a derived target only runs for `active`.
 */
export async function loadBillSnapshots(
  userId: string,
  categories: readonly BudgetCategoryRow[],
  todayKey: string,
): Promise<BillSnapshot[]> {
  const lastCharge = await lastChargeByEnvelope(userId);
  const snapshots: BillSnapshot[] = [];

  for (const category of categories) {
    const bill = storedBillOf(category);
    if (bill === null || category.bill?.status !== "active") continue;

    const anchor = billAnchor(bill, lastCharge.get(category.id) ?? null, todayKey);
    if (anchor.nextDueKey === null || bill.expectedCents === null) continue;

    snapshots.push({
      id: category.id,
      name: category.name,
      cadenceMonths: bill.cadenceMonths,
      cadenceDays: bill.cadenceDays ?? null,
      expectedCents: bill.expectedCents,
      nextDueKey: anchor.nextDueKey,
      expectedKey: anchor.expectedKey,
    });
  }

  return snapshots;
}
