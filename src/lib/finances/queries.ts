import {
  and,
  asc,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNotNull,
  lte,
  max,
  or,
  sql,
} from "drizzle-orm";
import { db } from "@/db";
import { oncePerRequest } from "@/lib/db/requestMemo";
import {
  financeAccounts,
  financeBudgetCategories,
  financePaymentResolutions,
  financePayees,
  financeStatementRates,
  financeStatements,
  financeTransactions,
} from "@/db/schema";
import type { FinanceExecutor } from "./dbExecutor";
import { effectiveFlow } from "./analytics";
import { collapsedYearGroupIds } from "./grouping";
import { THIS_MONTH_DATE_FILTER } from "./registerFields";
import { numericStringToCents } from "./money";
import { checkStatements, type ReconcileTransaction } from "./reconcile";
import { bankRows, moneyRows } from "./splitRows";
import type {
  FinanceAccountRow,
  ParsedStatementRate,
  StatementListRow,
  StatementPeriodRow,
  StatementsView,
  TransactionFilter,
  TransactionListRow,
} from "./types";
import { trackAsBillDraft, type TrackAsBillDraft } from "./registerBillDraft";
import {
  annotateCategoryAssignability,
  notBudgetedIdsOf,
  parseRegisterQuery,
  prepareRegister,
  REGISTER_BLOCK_SIZE,
  registerDateBound,
  registerFacets,
  type AssignabilitySubsetRow,
  type RegisterQuery,
  type RegisterPrepared,
  type RegisterQueryContext,
  type RegisterRowBlock,
} from "./registerQuery";

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

/**
 * What each split parent's children add up to, one row per parent, read once.
 *
 * A join to this aggregate rather than two correlated subqueries per row: the count and the
 * total are the same two facts, and a correlated subquery runs once per listed row, which on
 * a whole-ledger read was two thirds of the database time
 * (`agent-os/specs/2026-10-13-1147-finance-narrow-ledger-reads/` D6). Scoped by user on its
 * own side of the join. A row that is not a parent has no entry here, and the columns below
 * turn that into zero.
 */
function splitChildTotals(userId: string) {
  return db
    .select({
      parentId: financeTransactions.parentId,
      childCount: sql<number>`count(*)::int`.as("child_count"),
      childTotal: sql<string>`sum(${financeTransactions.amount})`.as("child_total"),
    })
    .from(financeTransactions)
    .where(
      and(
        eq(financeTransactions.userId, userId),
        isNotNull(financeTransactions.parentId),
      ),
    )
    .groupBy(financeTransactions.parentId)
    .as("split_totals");
}

/**
 * The one definition of a register row's columns and joins, for every read that returns
 * `TransactionListRow`s: the ledger list, a block by ids, one transaction, a split's
 * children. They differ only in their `where` and `orderBy`, so those are what the caller
 * adds; the columns and the split-child totals cannot drift apart between them.
 */
function transactionListQuery(userId: string) {
  const split = splitChildTotals(userId);
  return (
    db
      .select({
        id: financeTransactions.id,
        accountId: financeTransactions.accountId,
        accountName: financeAccounts.name,
        accountKind: financeAccounts.kind,
        transactionDate: financeTransactions.transactionDate,
        postedDate: financeTransactions.postedDate,
        pending: financeTransactions.pending,
        unlistedAt: financeTransactions.unlistedAt,
        description: financeTransactions.description,
        amount: financeTransactions.amount,
        sourceCategory: financeTransactions.sourceCategory,
        externalSource: financeTransactions.externalSource,
        derivedFlow: financeTransactions.derivedFlow,
        transferGroupId: financeTransactions.transferGroupId,
        flowOverride: financeTransactions.flowOverride,
        notes: financeTransactions.notes,
        balanceAfter: financeTransactions.balanceAfter,
        budgetCategoryId: financeTransactions.budgetCategoryId,
        budgetCategoryName: financeBudgetCategories.name,
        payeeId: financeTransactions.payeeId,
        payeeName: financePayees.name,
        parentId: financeTransactions.parentId,
        splitChildCount: sql<number>`coalesce(${split.childCount}, 0)::int`,
        splitChildTotal: sql<string>`coalesce(${split.childTotal}, 0)`,
      })
      .from(financeTransactions)
      .innerJoin(financeAccounts, eq(financeAccounts.id, financeTransactions.accountId))
      // Left, not inner: most rows have no envelope, and an inner join would silently empty
      // the register for anyone who has not set a budget up.
      .leftJoin(
        financeBudgetCategories,
        eq(financeBudgetCategories.id, financeTransactions.budgetCategoryId),
      )
      // Left for the same reason: a row imported since the last pass has no payee yet.
      .leftJoin(
        financePayees,
        and(
          eq(financePayees.id, financeTransactions.payeeId),
          eq(financePayees.userId, userId),
        ),
      )
      // Left: only a split parent has an entry.
      .leftJoin(split, eq(split.parentId, financeTransactions.id))
  );
}

/** Accounts with their balance and row count, newest-named first for a stable picker. */
export function listAccounts(
  userId: string,
  executor: FinanceExecutor = db,
): Promise<FinanceAccountRow[]> {
  return accountsOncePerRequest(executor, userId);
}

/**
 * Nearly every finance loader starts from the account list, so one page asks for it several
 * times over; see `oncePerRequest` for why sharing that answer is safe.
 *
 * The three reads are independent and go out together. The post-statement total used to
 * wait for the statements to come back so it could name each account's cutoff date; it now
 * joins to that cutoff instead, which is the same comparison made where the dates live.
 */
const accountsOncePerRequest = oncePerRequest(readAccounts);

async function readAccounts(
  executor: FinanceExecutor,
  userId: string,
): Promise<FinanceAccountRow[]> {
  const latestStatement = executor
    .select({
      accountId: financeStatements.accountId,
      periodEnd: max(financeStatements.periodEnd).as("latest_period_end"),
    })
    .from(financeStatements)
    .where(eq(financeStatements.userId, userId))
    .groupBy(financeStatements.accountId)
    .as("latest_statement");

  const [rows, latestRows, postRows] = await Promise.all([
    executor
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
        historySource: financeAccounts.historySource,
        // The two answers of D2 in one scan, which is where noticing they differ started:
        // the balance is money and wants leaves, the count is bank rows and wants parents.
        balance: sql<string>`coalesce(sum(${financeTransactions.amount}) filter (where ${moneyRows}), 0)`,
        transactionCount: sql<number>`count(${financeTransactions.id}) filter (where ${bankRows})::int`,
        // A live balance from the bank outranks both the statement close and the ledger sum:
        // it is what the bank's own app shows, read seconds ago. Nulls where an account has
        // no live feed, which is every account until one is linked.
        syncedBalanceCents: financeAccounts.balanceCents,
        syncedBalanceAsOf: financeAccounts.balanceAsOf,
        syncedBalanceSource: financeAccounts.balanceSource,
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
      .orderBy(asc(financeAccounts.name)),
    executor
      .select({
        accountId: financeStatements.accountId,
        periodEnd: financeStatements.periodEnd,
        closingBalance: financeStatements.closingBalance,
      })
      .from(financeStatements)
      .where(eq(financeStatements.userId, userId))
      .orderBy(desc(financeStatements.periodEnd), desc(financeStatements.id)),
    executor
      .select({
        accountId: financeTransactions.accountId,
        total: sql<string>`coalesce(sum(${financeTransactions.amount}), 0)`,
      })
      .from(financeTransactions)
      .innerJoin(
        latestStatement,
        eq(latestStatement.accountId, financeTransactions.accountId),
      )
      .where(
        and(
          eq(financeTransactions.userId, userId),
          // Money: leaves. Splitting a row after the statement closed must not move the
          // post-statement total, or the account's balance would jump for no reason.
          moneyRows,
          gt(financeTransactions.transactionDate, latestStatement.periodEnd),
        ),
      )
      .groupBy(financeTransactions.accountId),
  ]);

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

  const postByAccount = new Map(
    postRows.map((row) => [row.accountId, numericStringToCents(row.total) ?? 0]),
  );

  return rows.map((row) => {
    const ledgerBalanceCents = numericStringToCents(row.balance) ?? 0;
    const latest = latestByAccount.get(row.id);
    const postCents = latest ? (postByAccount.get(row.id) ?? 0) : 0;
    const statementAnchored = latest
      ? latest.closingCents + postCents
      : ledgerBalanceCents;

    const synced =
      row.syncedBalanceCents !== null && row.syncedBalanceAsOf !== null
        ? {
            cents: row.syncedBalanceCents,
            asOf: row.syncedBalanceAsOf,
            source: row.syncedBalanceSource,
          }
        : null;
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
      historySource: row.historySource,
      balanceCents,
      ledgerBalanceCents,
      statementClosingCents: latest?.closingCents ?? null,
      statementPeriodEnd: latest?.periodEnd ?? null,
      // Against a live balance this stops being a statement-versus-register question and
      // becomes the useful one: how far the register has drifted from what the bank says,
      // which is the same as asking whether the register is complete.
      balanceMismatchCents: synced || latest ? ledgerBalanceCents - balanceCents : 0,
      syncedBalanceAsOf: synced?.asOf ?? null,
      balanceSource: synced?.source ?? null,
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
  options?: { rowSet?: "bank" | "money" },
): Promise<TransactionListRow[]> {
  const rowSet = options?.rowSet === "money" ? moneyRows : bankRows;
  const rows = await transactionListQuery(userId)
    // Bank rows for the ordinary register (split children are reached through their
    // parent, D8). Money leaves for the Activity view, whose contributing set is the
    // children, not the parent (`2026-08-28-1356-budget-activity-register-links` D3).
    .where(and(rowSet, ...scopeConditions(userId, filter)))
    .orderBy(
      desc(financeTransactions.transactionDate),
      // Same-day rows need a tiebreak or their order shifts between loads, which reads as
      // the register rearranging itself for no reason.
      desc(financeTransactions.createdAt),
      asc(financeTransactions.id),
    );

  return rows.map(toTransactionListRow);
}

function toTransactionListRow(row: {
  id: string;
  accountId: string;
  accountName: string;
  accountKind: TransactionListRow["accountKind"];
  transactionDate: string;
  postedDate: string | null;
  pending: boolean;
  unlistedAt: Date | null;
  description: string;
  amount: string;
  sourceCategory: string;
  externalSource: string | null;
  derivedFlow: TransactionListRow["derivedFlow"];
  transferGroupId: string | null;
  flowOverride: TransactionListRow["flowOverride"];
  notes: string;
  balanceAfter: string | null;
  budgetCategoryId: string | null;
  budgetCategoryName: string | null;
  payeeId: string | null;
  payeeName: string | null;
  parentId: string | null;
  splitChildCount: number;
  splitChildTotal: string;
}): TransactionListRow {
  return {
    id: row.id,
    accountId: row.accountId,
    accountName: row.accountName,
    accountKind: row.accountKind,
    transactionDate: row.transactionDate,
    postedDate: row.postedDate,
    pending: row.pending,
    unlistedAt: row.unlistedAt,
    description: row.description,
    amountCents: numericStringToCents(row.amount) ?? 0,
    sourceCategory: row.sourceCategory,
    externalSource: row.externalSource,
    derivedFlow: row.derivedFlow,
    transferGroupId: row.transferGroupId,
    flowOverride: row.flowOverride,
    notes: row.notes,
    balanceAfterCents: numericStringToCents(row.balanceAfter),
    budgetCategoryId: row.budgetCategoryId,
    budgetCategoryName: row.budgetCategoryName,
    payeeId: row.payeeId,
    payeeName: row.payeeName,
    parentId: row.parentId,
    splitChildCount: row.splitChildCount,
    splitImbalanceCents:
      row.splitChildCount === 0
        ? 0
        : (numericStringToCents(row.amount) ?? 0) -
          (numericStringToCents(row.splitChildTotal) ?? 0),
  };
}

/** User-scoped detail rows for a Register block, preserving the requested order. */
export async function listTransactionsByIds(
  userId: string,
  ids: readonly string[],
): Promise<TransactionListRow[]> {
  const wanted = [...new Set(ids)].slice(0, 100);
  if (wanted.length === 0) return [];
  const rows = await transactionListQuery(userId).where(
    and(
      eq(financeTransactions.userId, userId),
      inArray(financeTransactions.id, wanted),
    ),
  );
  const byId = new Map(rows.map((row) => [row.id, toTransactionListRow(row)]));
  return wanted.flatMap((id) => {
    const row = byId.get(id);
    return row ? [row] : [];
  });
}

/**
 * Every bank row's count and the calendar years the ledger spans, in one scan.
 *
 * The two whole-view facts a date window cannot give: `total` is the "of N" in the grid's
 * count, and the years decide which prior years the page collapses by default. One query so
 * the first paint stays within `read-latency.md`'s ten.
 */
async function readBankRowTotals(
  userId: string,
): Promise<{ total: number; years: string[] }> {
  const [row] = await db
    .select({
      total: sql<number>`count(*)::int`,
      years: sql<
        string[]
      >`coalesce(array_agg(distinct extract(year from ${financeTransactions.transactionDate})::int::text), '{}')`,
    })
    .from(financeTransactions)
    .where(and(bankRows, eq(financeTransactions.userId, userId)));
  return { total: row?.total ?? 0, years: [...(row?.years ?? [])].sort() };
}

/**
 * The rows that can be "not budgeted", in ledger order: those of an off-budget account, the
 * legs of a transfer (anything with a group id, so both legs of a pair), and those whose
 * stored flow is `internal_transfer`. Everything else is assignable by construction; see
 * `AssignabilitySubsetRow`. Same scope and order as {@link listTransactions}.
 */
async function readAssignabilitySubset(
  userId: string,
  /**
   * Which accounts count as off budget: the ids a caller already holds, or `"flagged"` for
   * the accounts' own `off_budget` column. The second is for a caller that has not read the
   * accounts yet and would otherwise have to wait for them; it selects the same rows, because
   * the caller's set is built from that column, and the pure function still decides.
   */
  offBudget: ReadonlySet<string> | "flagged",
): Promise<AssignabilitySubsetRow[]> {
  const reasons = [
    isNotNull(financeTransactions.transferGroupId),
    sql`coalesce(${financeTransactions.flowOverride}, ${financeTransactions.derivedFlow}) = 'internal_transfer'`,
    offBudget === "flagged"
      ? sql`${financeTransactions.accountId} in (select id from ${financeAccounts} where ${financeAccounts.userId} = ${userId} and ${financeAccounts.offBudget})`
      : offBudget.size > 0
        ? inArray(financeTransactions.accountId, [...offBudget])
        : undefined,
  ];
  const rows = await db
    .select({
      id: financeTransactions.id,
      accountId: financeTransactions.accountId,
      transactionDate: financeTransactions.transactionDate,
      transferGroupId: financeTransactions.transferGroupId,
      derivedFlow: financeTransactions.derivedFlow,
      flowOverride: financeTransactions.flowOverride,
      amount: financeTransactions.amount,
    })
    .from(financeTransactions)
    .where(and(bankRows, eq(financeTransactions.userId, userId), or(...reasons)))
    .orderBy(
      desc(financeTransactions.transactionDate),
      desc(financeTransactions.createdAt),
      asc(financeTransactions.id),
    );
  return rows.map((row) => ({
    id: row.id,
    accountId: row.accountId,
    transactionDate: row.transactionDate,
    transferGroupId: row.transferGroupId,
    effectiveFlow: effectiveFlow({
      flowOverride: row.flowOverride,
      derivedFlow: row.derivedFlow,
      amountCents: numericStringToCents(row.amount) ?? 0,
    }),
  }));
}

function rowSetFor(query: RegisterQuery): { rowSet: "money" } | undefined {
  return query.viewId === "activity" || query.viewId === "report"
    ? { rowSet: "money" }
    : undefined;
}

/**
 * The Register's index and first block for a query.
 *
 * When the Date filter bounds the query (`registerDateBound`) this reads that window, the
 * assignability subset and one count: the rows the filter can keep, the rows whose Category
 * can be refused, and the two whole-view facts. `prepareRegister` then runs the filter over
 * the window exactly as it ran it over the ledger. Otherwise — Date = All, the derived views,
 * an unknown today, an advanced-filter-only date condition — it reads the whole ledger as it
 * always did. The two paths return the same `RegisterPrepared` for the same query.
 */
export async function loadRegisterPrepared(
  userId: string,
  rawQuery: unknown,
  ctx: RegisterQueryContext,
): Promise<RegisterPrepared> {
  const query = parseRegisterQuery(rawQuery);
  const bound = registerDateBound(query);
  if (bound === null) {
    const ledger = await listTransactions(userId, {}, rowSetFor(query));
    return prepareRegister(ledger, query, ctx);
  }
  const [window, subset, totals] = await Promise.all([
    listTransactions(userId, {
      ...(bound.from !== null ? { from: bound.from } : {}),
      ...(bound.to !== null ? { to: bound.to } : {}),
    }),
    readAssignabilitySubset(userId, ctx.offBudgetAccountIds),
    readBankRowTotals(userId),
  ]);
  return prepareRegister(window, query, ctx, {
    total: totals.total,
    notBudgetedIds: notBudgetedIdsOf(subset, ctx.offBudgetAccountIds),
  });
}

/**
 * The Register page's first paint: the default query's index and first block, and the prior
 * years it collapses.
 *
 * The default query is All Transactions, This Month, newest first, grouped by year and
 * month — and its collapsed groups are the ledger's other years, which only the ledger can
 * say. So the count-and-years read is part of the same wave as the window read, and the query
 * is assembled once all of it is back. One wave: the subset reads the off-budget flag itself
 * rather than waiting for the account list, which a chained read measurably cost.
 */
export async function loadRegisterInitial(
  userId: string,
  todayKey: string,
  budgetStartMonth: Promise<string | null>,
): Promise<{
  prepared: RegisterPrepared;
  defaultCollapsedGroups: string[];
}> {
  const accounts = listAccounts(userId);
  const base = {
    today: todayKey,
    sorts: [{ columnId: "date", direction: "desc" }],
    groupBy: ["year", "month"],
    filters: { date: THIS_MONTH_DATE_FILTER },
  };
  const bound = registerDateBound(parseRegisterQuery(base));
  if (bound === null) {
    throw new Error("The default Register query must bound the Date filter.");
  }
  const [window, totals, subset, accountRows, startMonth] = await Promise.all([
    listTransactions(userId, {
      ...(bound.from !== null ? { from: bound.from } : {}),
      ...(bound.to !== null ? { to: bound.to } : {}),
    }),
    readBankRowTotals(userId),
    readAssignabilitySubset(userId, "flagged"),
    accounts,
    budgetStartMonth,
  ]);
  const defaultCollapsedGroups = collapsedYearGroupIds(
    totals.years.map((year) => `${year}-01-01`),
    todayKey.slice(0, 4),
  );
  const offBudgetAccountIds = offBudgetIdsOf(accountRows);
  const prepared = prepareRegister(
    window,
    parseRegisterQuery({ ...base, collapsedGroups: defaultCollapsedGroups }),
    { offBudgetAccountIds, budgetStartMonth: startMonth },
    {
      total: totals.total,
      notBudgetedIds: notBudgetedIdsOf(subset, offBudgetAccountIds),
    },
  );
  return { prepared, defaultCollapsedGroups };
}

function offBudgetIdsOf(
  accounts: readonly { id: string; offBudget: boolean }[],
): Set<string> {
  return new Set(accounts.filter((account) => account.offBudget).map((a) => a.id));
}

/**
 * The distinct values behind a Register query's filter lists. Read when the browser first
 * opens a column menu or a filter dialog for a view, not with the index (D10).
 *
 * The whole ledger, on purpose: the lists are defined over the view's base rows, which no
 * window of dates can stand in for. Same read as `loadRegisterPrepared` makes for the same
 * view, so the two cannot disagree about which rows a view holds.
 */
export async function loadRegisterFacets(
  userId: string,
  rawQuery: unknown,
  ctx: RegisterQueryContext,
): Promise<Record<string, string[]>> {
  const query = parseRegisterQuery(rawQuery);
  const ledger = await listTransactions(userId, {}, rowSetFor(query));
  return registerFacets(ledger, query, ctx);
}

export async function loadRegisterBlock(
  userId: string,
  ids: readonly string[],
): Promise<RegisterRowBlock> {
  const rows = await listTransactionsByIds(userId, ids.slice(0, REGISTER_BLOCK_SIZE));
  return { queryKey: "", offset: 0, rows };
}

export async function loadRegisterExportRows(
  userId: string,
  rawQuery: unknown,
  ctx: RegisterQueryContext,
): Promise<TransactionListRow[]> {
  const query = parseRegisterQuery(rawQuery);
  const ledger = await listTransactions(
    userId,
    {},
    query.viewId === "activity" || query.viewId === "report"
      ? { rowSet: "money" }
      : undefined,
  );
  const preparedLedger = annotateCategoryAssignability(ledger, ctx.offBudgetAccountIds);
  const prepared = prepareRegister(preparedLedger, query, ctx);
  const byId = new Map(preparedLedger.map((row) => [row.id, row]));
  return prepared.index.nodeIds.flatMap((id) => {
    const row = byId.get(id);
    return row ? [row] : [];
  });
}

export async function loadTrackAsBillDraft(
  userId: string,
  transactionId: string,
  todayKey: string,
): Promise<TrackAsBillDraft> {
  const ledger = await listTransactions(userId);
  return trackAsBillDraft(ledger, transactionId, todayKey);
}

/** Net of the transactions matching a filter, in cents. Summed in SQL. */
export async function transactionTotalCents(
  userId: string,
  filter: TransactionFilter = {},
): Promise<number> {
  const [row] = await db
    .select({ total: sql<string>`coalesce(sum(${financeTransactions.amount}), 0)` })
    .from(financeTransactions)
    .where(and(moneyRows, ...scopeConditions(userId, filter)));

  return numericStringToCents(row?.total ?? "0") ?? 0;
}

/** One transaction, scoped to its owner. Null when it is not theirs. */
export async function getTransaction(
  userId: string,
  transactionId: string,
): Promise<TransactionListRow | null> {
  const [row] = await transactionListQuery(userId)
    .where(
      and(
        eq(financeTransactions.id, transactionId),
        eq(financeTransactions.userId, userId),
      ),
    )
    .limit(1);

  return row ? toTransactionListRow(row) : null;
}

/**
 * One split parent's children, in the order they were written.
 *
 * The only way a child is ever read (D8). They are deliberately outside the register's
 * index — no sort, no filter, no search — so this is a direct fetch by parent, and the
 * partial index on `(user_id, parent_id)` is what makes it one lookup.
 */
export async function listSplitChildren(
  userId: string,
  parentId: string,
): Promise<TransactionListRow[]> {
  const rows = await transactionListQuery(userId)
    .where(
      and(
        eq(financeTransactions.userId, userId),
        eq(financeTransactions.parentId, parentId),
      ),
    )
    .orderBy(asc(financeTransactions.createdAt), asc(financeTransactions.id));

  return rows.map(toTransactionListRow);
}

/**
 * The Statements page: every snapshot with its register check, and the coverage holes.
 *
 * Reconciled here rather than in the browser. The check reads the whole register, and
 * sending that to the client to compute a couple of hundred sums was 5 MB of page.
 */
export async function loadStatementsView(userId: string): Promise<StatementsView> {
  const [statements, transactions] = await Promise.all([
    listStatements(userId),
    listReconcileRows(userId),
  ]);
  return checkStatements(statements, transactions);
}

/**
 * The register as the reconcile arithmetic needs it: one bank row, its account and day, and
 * the amount. The register's own list read carries twenty more columns and three joins.
 */
async function listReconcileRows(userId: string): Promise<ReconcileTransaction[]> {
  const rows = await db
    .select({
      id: financeTransactions.id,
      accountId: financeTransactions.accountId,
      accountName: financeAccounts.name,
      transactionDate: financeTransactions.transactionDate,
      amount: financeTransactions.amount,
    })
    .from(financeTransactions)
    .innerJoin(financeAccounts, eq(financeAccounts.id, financeTransactions.accountId))
    .where(and(bankRows, eq(financeTransactions.userId, userId)));

  return rows.map((row) => ({
    id: row.id,
    accountId: row.accountId,
    accountName: row.accountName,
    transactionDate: row.transactionDate,
    amountCents: numericStringToCents(row.amount) ?? 0,
  }));
}

/**
 * The register rows inside one statement's period, newest first — the rows whose sum is
 * that statement's `registerSumCents`.
 *
 * Takes the statement rather than an account and two dates so the period is read from the
 * stored row, not from whatever the caller sends. Same membership as `reconcile.ts`: bank
 * rows on the statement's account, both period ends inclusive.
 */
export async function listStatementPeriodRows(
  userId: string,
  statementId: string,
): Promise<StatementPeriodRow[]> {
  const rows = await db
    .select({
      id: financeTransactions.id,
      transactionDate: financeTransactions.transactionDate,
      description: financeTransactions.description,
      amount: financeTransactions.amount,
    })
    .from(financeStatements)
    .innerJoin(
      financeTransactions,
      and(
        eq(financeTransactions.accountId, financeStatements.accountId),
        // The statement is already the user's, but the rows are scoped on their own column
        // too rather than trusting that an account's rows all share its owner.
        eq(financeTransactions.userId, userId),
        gte(financeTransactions.transactionDate, financeStatements.periodStart),
        lte(financeTransactions.transactionDate, financeStatements.periodEnd),
      ),
    )
    .where(
      and(
        eq(financeStatements.id, statementId),
        eq(financeStatements.userId, userId),
        bankRows,
      ),
    )
    .orderBy(
      desc(financeTransactions.transactionDate),
      desc(financeTransactions.createdAt),
      asc(financeTransactions.id),
    );

  return rows.map((row) => ({
    id: row.id,
    transactionDate: row.transactionDate,
    description: row.description,
    amountCents: numericStringToCents(row.amount) ?? 0,
  }));
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
