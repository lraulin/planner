import { and, asc, eq, gte, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { oncePerRequest } from "@/lib/db/requestMemo";
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
import { loadAccountsWithPending } from "../workingPendingQuery";
import { lastChargeByEnvelope } from "../billLastCharge";
import { billAnchor, type BillAnchor } from "../commitments";
import type { StoredBill } from "../recurringBills";
import { walksNextDue } from "./inspector";
import {
  buildBudget,
  findMonth,
  monthKeyOf,
  shiftMonthKey,
  type BudgetMonth,
  type MonthKey,
} from "./envelope";
import { effectiveOpeningCents } from "./openingSeed";
import { parseNullableTargetOrThrow, type Target } from "./targets/types";
import { budgetEnvelopeLabel } from "./hierarchy";
import type { BillSnapshot } from "./targets/derive";
import { ASSIGN_AVERAGE_MONTHS } from "./assign/types";
import type { ActivityPoint } from "./assign/fromBudget";
import { budgetContributionSql } from "./contributionSql";
import { listBudgetMovementAudit } from "../audit/queries";
import {
  budgetMismatchOf,
  liveDriftSince,
  positionBefore,
  recordedOpeningsOf,
  type BudgetMismatch,
} from "./accountDrift";

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

/**
 * The envelope and group structure with no fold behind it — for surfaces that need to know
 * what envelopes exist and where they sit, not what they hold this month.
 */
export async function listBudgetStructure(
  userId: string,
): Promise<{ groups: BudgetGroupRow[]; categories: BudgetCategoryRow[] }> {
  const [groups, categoryRows] = await Promise.all([
    groupsOf(userId),
    categoriesOf(userId),
  ]);
  return { groups, categories: parsedCategories(categoryRows) };
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
   * The opening actually fed to the fold: `Σ finance_accounts.budget_opening_cents` over
   * on-budget accounts once every one of them is seeded, else the legacy `settings.openingCents`
   * total (`effectiveOpeningCents`, D2). 0 when unconfigured.
   */
  openingCents: number;
  /**
   * Signed sum of on-budget working balances right now — the same pending selection and
   * headline anchoring the Dashboard uses. A diagnostic only: Ready to Assign no longer
   * reconciles to this (`agent-os/specs/2026-09-14-1004-ledger-ready-to-assign/` D1).
   */
  accountPoolCents: number;
  /** Per-account and transfer drift from the register — warnings, never RTA terms (D3). */
  mismatch: BudgetMismatch;
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
   * `openingCents` is the answer.
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

/**
 * The group and envelope lists sit under the budget, the envelope catalog and the bare
 * structure, and one page often wants two of those; see `oncePerRequest`.
 */
function groupsOf(userId: string, executor: FinanceExecutor = db) {
  return groupsOncePerRequest(executor, userId);
}

function categoriesOf(userId: string, executor: FinanceExecutor = db) {
  return categoriesOncePerRequest(executor, userId);
}

const groupsOncePerRequest = oncePerRequest(readGroups);
const categoriesOncePerRequest = oncePerRequest(readCategories);

async function readGroups(executor: FinanceExecutor, userId: string) {
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

async function readCategories(executor: FinanceExecutor, userId: string) {
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
      // A Reconcile adjustment (D5) is deliberately uncategorized forever — that is what
      // makes it an RTA term — so its amount belongs in the sum, but counting it here would
      // nag Lee to file a transaction that was never meant to get an envelope.
      count: sql<number>`count(*) filter (where ${financeTransactions.externalSource} is distinct from 'reconcile')::int`,
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

  const [stored, groups, categoryRows, { accounts, pending }] = await Promise.all([
    readSetting(userId, BUDGET_SCOPE, executor),
    groupsOf(userId, executor),
    categoriesOf(userId, executor),
    loadAccountsWithPending(userId, executor),
  ]);
  const categories = parsedCategories(categoryRows);

  const settings = parseBudget(stored);
  const poolCents = accountPoolCents(accounts, pending.rows);

  const empty: BudgetData = {
    configured: false,
    settings,
    groups,
    categories,
    months: [],
    month: currentMonth,
    todayKey,
    openingCents: 0,
    accountPoolCents: poolCents,
    mismatch: { accounts: [], unmatchedTransferCents: 0 },
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
      prospectiveOpeningCents: await positionBefore(
        userId,
        currentMonth,
        accounts.filter((account) => !account.offBudget),
        pending,
        executor,
      ),
    };
  }

  const endMonth = shiftMonthKey(
    currentMonth > startMonth ? currentMonth : startMonth,
    BUDGET_HORIZON_MONTHS,
  );

  // The movement log belongs to the month shown, and which month that is falls out of the
  // fold below. It is almost always the one asked for, so that month's log is read beside
  // the fold's inputs and only read again if the fold lands somewhere else.
  const wanted = requestedMonth ?? currentMonth;
  const includeMovementEvents = options.includeMovementEvents !== false;

  const [
    allocations,
    bufferedRows,
    activity,
    backlog,
    accountOpenings,
    drift,
    wantedMonthEvents,
  ] = await Promise.all([
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
    recordedOpeningsOf(userId, executor),
    liveDriftSince(userId, startMonth, accounts, pending, executor),
    includeMovementEvents ? listBudgetMovementAudit(userId, wanted, executor) : [],
  ]);
  const mismatch = budgetMismatchOf(accounts, accountOpenings, drift);
  const foldActivity = activity.filter((row) => row.month >= startMonth);
  const preStartActivity = activity.filter((row) => row.month < startMonth);
  const openingCents = effectiveOpeningCents(accountOpenings, settings.openingCents);

  const months = buildBudget({
    categories: categories.map((category) => ({
      id: category.id,
      groupId: category.groupId,
      isIncome: category.kind === "income",
      // A target's `since` is the day it started asking, and the contribution window is a
      // month comparison rather than a day filter (`target-since-month-granularity`). The fold
      // does not know what it is for; only `save` targets read the number it produces.
      ...(category.target?.since
        ? { contributionsFrom: monthKeyOf(category.target.since) }
        : {}),
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
    openingCents,
    current:
      currentMonth >= startMonth
        ? {
            month: currentMonth,
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

  const month = findMonth(months, wanted)
    ? wanted
    : (months.find((entry) => entry.month >= wanted)?.month ??
      months[months.length - 1]?.month ??
      currentMonth);
  const movementEvents =
    !includeMovementEvents || month === wanted
      ? wantedMonthEvents
      : await listBudgetMovementAudit(userId, month, executor);

  return {
    ...empty,
    configured: true,
    months,
    month,
    openingCents,
    mismatch,
    goals,
    movementEvents,
    ...backlog,
    preStartActivity,
  };
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
  return billAnchorsOf(categories, await lastChargeByEnvelope(userId), todayKey);
}

/**
 * {@link loadBillAnchors} for a page that reads the last charges beside the budget rather
 * than after it — the categories are the only thing the anchors need the budget for.
 */
export function billAnchorsOf(
  categories: readonly BudgetCategoryRow[],
  lastCharge: ReadonlyMap<string, string>,
  todayKey: string,
): Map<string, BillAnchor> {
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
