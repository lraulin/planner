import { and, asc, eq, gte, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  financeAccounts,
  financeBudgetAllocations,
  financeBudgetCategories,
  financeBudgetMonths,
  financeCategoryGroups,
  financePayees,
  financeTransactions,
} from "@/db/schema";
import type { EnvelopeKind, EnvelopeStatus } from "@/db/schema";
import { readSetting } from "@/lib/settings/queries";
import { BUDGET_SCOPE } from "@/lib/settings/scopes";
import { parseBudget, type BudgetSettings } from "@/lib/settings/finances";
import { toDateKey } from "@/lib/schedule/geometry";
import { numericStringToCents } from "../money";
import { listAccounts } from "../queries";
import { billAnchor } from "../commitments";
import {
  buildBudget,
  findMonth,
  monthEndKey,
  monthKeyOf,
  shiftMonthKey,
  type BudgetMonth,
  type MonthKey,
} from "./envelope";
import { parseTemplates, type Template } from "./templates/types";
import { budgetEnvelopeLabel } from "./hierarchy";
import type { BillSnapshot } from "./templates/schedule";
import { ASSIGN_AVERAGE_MONTHS } from "./assign/types";
import type { ActivityPoint } from "./assign/fromBudget";

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
  /** Spending-taxonomy values this envelope claims, for the auto-map and its editor. */
  sourceCategories: string[];
  templates: Template[];
};

export type BudgetEnvelopeOption = {
  id: string;
  /** Group path, for pickers that need to tell two envelopes with the same leaf name apart. */
  label: string;
  /** Envelope's own name — what the register Category column stores. */
  name: string;
  kind: EnvelopeKind;
};

/** Small schedule-editor read; labels include the complete group path for nested budgets. */
export async function listBudgetEnvelopeOptions(
  userId: string,
): Promise<BudgetEnvelopeOption[]> {
  const [groups, categories] = await Promise.all([
    groupsOf(userId),
    categoriesOf(userId),
  ]);
  return categories.map((category) => ({
    id: category.id,
    label: budgetEnvelopeLabel(groups, category),
    name: category.name,
    kind: category.kind,
  }));
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
   * Template goals written by Apply / Overwrite, keyed `month|categoryId`.
   * Absent means no goal for that cell.
   */
  goals: Record<string, number>;
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
  /** Append-only movement descriptions for the selected month, newest shown first. */
  movementNotes: string;
  /**
   * Categorised activity in the 12 months before `startMonth`. Assigned is not stored
   * there; Average Spent / Spent Last Month still need the spend.
   */
  preStartActivity: ActivityPoint[];
};

function groupsOf(userId: string) {
  return db
    .select({
      id: financeCategoryGroups.id,
      parentGroupId: financeCategoryGroups.parentGroupId,
      name: financeCategoryGroups.name,
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
      templates: financeBudgetCategories.templates,
      kind: financeBudgetCategories.kind,
      status: financeBudgetCategories.status,
      cancelledOn: financeBudgetCategories.cancelledOn,
      url: financeBudgetCategories.url,
      cadenceMonths: financeBudgetCategories.cadenceMonths,
      cadenceDays: financeBudgetCategories.cadenceDays,
      dueDay: financeBudgetCategories.dueDay,
      anchorDate: financeBudgetCategories.anchorDate,
      scheduled: financeBudgetCategories.scheduled,
      expectedCents: financeBudgetCategories.expectedCents,
    })
    .from(financeBudgetCategories)
    .where(eq(financeBudgetCategories.userId, userId))
    .orderBy(asc(financeBudgetCategories.sortKey));
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
    sourceCategories: row.sourceCategories,
    templates: parseTemplates(row.templates) ?? [],
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
        sql`(
          ${financeTransactions.transferGroupId} is not null
          or coalesce(${financeTransactions.flowOverride}::text, ${financeTransactions.derivedFlow}::text, '') <> 'internal_transfer'
        )`,
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

  const [stored, groups, categoryRows, accounts] = await Promise.all([
    readSetting(userId, BUDGET_SCOPE),
    groupsOf(userId),
    categoriesOf(userId),
    listAccounts(userId),
  ]);
  const categories = parsedCategories(categoryRows);

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
    goals: {},
    prospectiveOpeningCents: 0,
    movementNotes: "",
    preStartActivity: [],
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
        goalCents: financeBudgetAllocations.goalCents,
      })
      .from(financeBudgetAllocations)
      .where(eq(financeBudgetAllocations.userId, userId)),
    db
      .select({
        month: financeBudgetMonths.month,
        bufferedCents: financeBudgetMonths.bufferedCents,
        notes: financeBudgetMonths.notes,
      })
      .from(financeBudgetMonths)
      .where(eq(financeBudgetMonths.userId, userId)),
    activitySince(userId, shiftMonthKey(startMonth, -ASSIGN_AVERAGE_MONTHS)),
    backlogSince(userId, startMonth),
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
    })),
    activity: foldActivity,
    buffered: bufferedRows,
    startMonth,
    endMonth,
    openingCents: settings.openingCents,
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

  return {
    ...empty,
    configured: true,
    months,
    month,
    goals,
    movementNotes: bufferedRows.find((row) => row.month === month)?.notes ?? "",
    ...backlog,
    preStartActivity,
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

/**
 * The last posted charge date per bill envelope, keyed by envelope id — what `billAnchor`
 * needs to compute a next-due date. Joined through the payee claim, which is what routes a
 * charge to a bill (`finance_payees.budget_category_id`), not through the transaction's own
 * `budget_category_id` — a hand-recategorised charge should not move the due-date anchor.
 */
async function lastChargeByEnvelope(userId: string): Promise<Map<string, string>> {
  const rows = await db
    .select({
      envelopeId: financePayees.budgetCategoryId,
      lastChargeKey: sql<string>`max(${financeTransactions.transactionDate})`,
    })
    .from(financeTransactions)
    .innerJoin(financePayees, eq(financePayees.id, financeTransactions.payeeId))
    .where(
      and(
        eq(financeTransactions.userId, userId),
        eq(financePayees.userId, userId),
        isNotNull(financePayees.budgetCategoryId),
      ),
    )
    .groupBy(financePayees.budgetCategoryId);

  return new Map(
    rows
      .filter((row): row is { envelopeId: string; lastChargeKey: string } =>
        Boolean(row.envelopeId),
      )
      .map((row) => [row.envelopeId, row.lastChargeKey]),
  );
}

/**
 * Every active bill envelope reduced to what the apply engine needs, as of `todayKey`.
 *
 * The budget page reads these alongside the budget so the template drawer can preview this
 * month's demand by running the same pure engine the server runs — not a second guess at it.
 * Paused and cancelled bills are excluded: `billFundingDemand` only ever runs for `active`.
 */
export async function loadBillSnapshots(
  userId: string,
  categories: readonly BudgetCategoryRow[],
  todayKey: string,
): Promise<BillSnapshot[]> {
  const lastCharge = await lastChargeByEnvelope(userId);
  const snapshots: BillSnapshot[] = [];

  for (const category of categories) {
    if (category.kind !== "bill" || !category.bill) continue;
    if (category.bill.status !== "active") continue;
    const cadenceMonths = category.bill.cadenceMonths;
    if (cadenceMonths === null) continue;

    const anchor = billAnchor(
      {
        name: category.name,
        cadenceMonths,
        cadenceDays: category.bill.cadenceDays,
        anchorDate: category.bill.anchorDate,
        expectedCents: category.bill.expectedCents,
        scheduled: category.bill.scheduled,
        dueDay: category.bill.dueDay,
      },
      lastCharge.get(category.id) ?? null,
      todayKey,
    );
    if (anchor.nextDueKey === null || category.bill.expectedCents === null) continue;

    snapshots.push({
      id: category.id,
      name: category.name,
      cadenceMonths,
      cadenceDays: category.bill.cadenceDays,
      expectedCents: category.bill.expectedCents,
      nextDueKey: anchor.nextDueKey,
    });
  }

  return snapshots;
}
