import { and, asc, eq, gte, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  financeAccounts,
  financeBudgetAllocations,
  financeBudgetCategories,
  financeBudgetMonths,
  financeCategoryGroups,
  financeTransactions,
} from "@/db/schema";
import { readSetting } from "@/lib/settings/queries";
import { BUDGET_SCOPE } from "@/lib/settings/scopes";
import { parseBudget, type BudgetSettings } from "@/lib/settings/finances";
import { toDateKey } from "@/lib/schedule/geometry";
import { numericStringToCents } from "../money";
import { listAccounts } from "../queries";
import {
  buildBudget,
  findMonth,
  monthEndKey,
  monthKeyOf,
  shiftMonthKey,
  type BudgetMonth,
  type MonthKey,
} from "./envelope";

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
  name: string;
  isIncome: boolean;
  sortKey: string;
  hidden: boolean;
};

export type BudgetCategoryRow = {
  id: string;
  groupId: string;
  name: string;
  sortKey: string;
  hidden: boolean;
  notes: string;
  /** Spending-taxonomy values this envelope claims, for the auto-map and its editor. */
  sourceCategories: string[];
};

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
   * On-budget position right now, from the same headline balances the Dashboard uses.
   *
   * The budget's own arithmetic never needs this — the fold is self-consistent from the
   * recorded opening figure. It is here to be *checked against*, which is what turns a
   * silent drift into a number on screen.
   */
  onBudgetPositionCents: number;
  /** On-budget rows since the start month with no envelope: the size of the backlog. */
  uncategorizedCount: number;
  uncategorizedCents: number;
  /**
   * What setup would actually seed "funds from last month" with — the position at the end of
   * *last* month, not today's.
   *
   * A separate field from `onBudgetPositionCents` because the two genuinely differ by this
   * month's activity so far, and the setup screen names a figure the user then sees again as
   * their first Ready to Assign. Showing today's position there and seeding last month's is
   * the exact failure `2026-08-18-2058-commitments-clarity` was written about: the decision
   * surface reporting a different number than the system uses. Zero once configured, where
   * the recorded `settings.openingCents` is the answer.
   */
  prospectiveOpeningCents: number;
};

function groupsOf(userId: string) {
  return db
    .select({
      id: financeCategoryGroups.id,
      name: financeCategoryGroups.name,
      isIncome: financeCategoryGroups.isIncome,
      sortKey: financeCategoryGroups.sortKey,
      hidden: financeCategoryGroups.hidden,
    })
    .from(financeCategoryGroups)
    .where(eq(financeCategoryGroups.userId, userId))
    .orderBy(asc(financeCategoryGroups.sortKey));
}

function categoriesOf(userId: string) {
  return db
    .select({
      id: financeBudgetCategories.id,
      groupId: financeBudgetCategories.groupId,
      name: financeBudgetCategories.name,
      sortKey: financeBudgetCategories.sortKey,
      hidden: financeBudgetCategories.hidden,
      notes: financeBudgetCategories.notes,
      sourceCategories: financeBudgetCategories.sourceCategories,
    })
    .from(financeBudgetCategories)
    .where(eq(financeBudgetCategories.userId, userId))
    .orderBy(asc(financeBudgetCategories.sortKey));
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
 * A transfer to an **off-budget** account is deliberately still counted. Money moved to
 * savings has left the budget, and that is exactly what spending from a "Savings" envelope
 * means.
 */
async function activitySince(userId: string, since: MonthKey) {
  const rows = await db
    .select({
      month: sql<string>`to_char(date_trunc('month', ${financeTransactions.transactionDate}), 'YYYY-MM-DD')`,
      categoryId: financeTransactions.budgetCategoryId,
      amount: sql<string>`sum(${financeTransactions.amount})`,
    })
    .from(financeTransactions)
    .innerJoin(financeAccounts, eq(financeAccounts.id, financeTransactions.accountId))
    .where(
      and(
        eq(financeTransactions.userId, userId),
        eq(financeAccounts.userId, userId),
        eq(financeAccounts.offBudget, false),
        isNotNull(financeTransactions.budgetCategoryId),
        gte(financeTransactions.transactionDate, since),
        sql`not exists (
          select 1
            from ${financeTransactions} as other
            join ${financeAccounts} as other_account
              on other_account.id = other.account_id
           where other.transfer_group_id = ${financeTransactions.transferGroupId}
             and other.id <> ${financeTransactions.id}
             and other.user_id = ${userId}
             and other_account.off_budget = false
        )`,
      ),
    )
    .groupBy(sql`1`, financeTransactions.budgetCategoryId);

  return rows.map((row) => ({
    month: row.month,
    categoryId: row.categoryId as string,
    amountCents: numericStringToCents(row.amount) ?? 0,
  }));
}

/** On-budget rows since `since` that nothing has put in an envelope yet. */
async function backlogSince(userId: string, since: MonthKey) {
  const [row] = await db
    .select({
      count: sql<number>`count(*)::int`,
      amount: sql<string>`coalesce(sum(${financeTransactions.amount}), 0)`,
    })
    .from(financeTransactions)
    .innerJoin(financeAccounts, eq(financeAccounts.id, financeTransactions.accountId))
    .where(
      and(
        eq(financeTransactions.userId, userId),
        eq(financeAccounts.userId, userId),
        eq(financeAccounts.offBudget, false),
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
): Promise<BudgetData> {
  const todayKey = toDateKey(new Date());
  const currentMonth = monthKeyOf(todayKey);

  const [stored, groups, categories, accounts] = await Promise.all([
    readSetting(userId, BUDGET_SCOPE),
    groupsOf(userId),
    categoriesOf(userId),
    listAccounts(userId),
  ]);

  const settings = parseBudget(stored);
  const onBudgetPositionCents = accounts
    .filter((account) => !account.offBudget)
    .reduce((total, account) => total + account.balanceCents, 0);

  const empty: BudgetData = {
    configured: false,
    settings,
    groups,
    categories,
    months: [],
    month: currentMonth,
    todayKey,
    onBudgetPositionCents,
    uncategorizedCount: 0,
    uncategorizedCents: 0,
    prospectiveOpeningCents: 0,
  };

  const startMonth = settings.startMonth;
  if (!startMonth) {
    return {
      ...empty,
      prospectiveOpeningCents: await openingPositionFor(userId, currentMonth),
    };
  }

  const endMonth = shiftMonthKey(
    currentMonth > startMonth ? currentMonth : startMonth,
    BUDGET_HORIZON_MONTHS,
  );

  const [allocations, bufferedRows, activity, backlog] = await Promise.all([
    db
      .select({
        month: financeBudgetAllocations.month,
        categoryId: financeBudgetAllocations.categoryId,
        amountCents: financeBudgetAllocations.amountCents,
        carryover: financeBudgetAllocations.carryover,
      })
      .from(financeBudgetAllocations)
      .where(eq(financeBudgetAllocations.userId, userId)),
    db
      .select({
        month: financeBudgetMonths.month,
        bufferedCents: financeBudgetMonths.bufferedCents,
      })
      .from(financeBudgetMonths)
      .where(eq(financeBudgetMonths.userId, userId)),
    activitySince(userId, startMonth),
    backlogSince(userId, startMonth),
  ]);

  const months = buildBudget({
    categories: categories.map((category) => ({
      id: category.id,
      groupId: category.groupId,
      isIncome:
        groups.find((group) => group.id === category.groupId)?.isIncome ?? false,
    })),
    allocations,
    activity,
    buffered: bufferedRows,
    startMonth,
    endMonth,
    openingCents: settings.openingCents,
  });

  const wanted = requestedMonth ?? currentMonth;
  const month = findMonth(months, wanted)
    ? wanted
    : (months.find((entry) => entry.month >= wanted)?.month ??
      months[months.length - 1]?.month ??
      currentMonth);

  return {
    ...empty,
    configured: true,
    months,
    month,
    ...backlog,
  };
}

/**
 * The on-budget position on the day before `month` began — the fold's opening figure.
 *
 * Recorded once at setup rather than recomputed on every load, so importing an old statement
 * cannot silently move last month's Ready to Assign
 * (`agent-os/specs/2026-08-22-1948-zero-based-budget/` D2). Reuses the headline balances and
 * walks back over the rows that came after, which is the same reconstruction
 * `periodResult.ts` does — the budget must not disagree with the Dashboard about one wallet.
 */
export async function openingPositionFor(
  userId: string,
  month: MonthKey,
): Promise<number> {
  const asOfKey = monthEndKey(shiftMonthKey(month, -1));
  const accounts = (await listAccounts(userId)).filter((account) => !account.offBudget);
  if (accounts.length === 0) return 0;

  const rows = await db
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
        eq(financeAccounts.offBudget, false),
        sql`${financeTransactions.transactionDate} > ${asOfKey}`,
      ),
    );

  const known = new Set(accounts.map((account) => account.id));
  const after = rows.reduce(
    (total, row) =>
      known.has(row.accountId)
        ? total + (numericStringToCents(row.amount) ?? 0)
        : total,
    0,
  );

  return accounts.reduce((total, account) => total + account.balanceCents, 0) - after;
}
