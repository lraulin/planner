import { and, eq, gte, notInArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { financeAccounts, financeTransactions } from "@/db/schema";
import type { FinanceExecutor } from "../dbExecutor";
import { numericStringToCents } from "../money";
import { moneyRows } from "../splitRows";
import type { FinanceAccountRow } from "../types";
import { accountBalanceView } from "../workingBalance";
import {
  loadAccountsWithPending,
  type WorkingPendingSelection,
} from "../workingPendingQuery";
import {
  monthEndKey,
  shiftMonthKey,
  unmatchedTransferCents,
  type MonthKey,
} from "./envelope";

/**
 * Where each on-budget account stands against the budget's recorded opening: the position
 * the day before a month began, and how far today's bank balance has drifted from
 * "opening + rows since start" (D3 of `agent-os/specs/2026-09-14-1004-ledger-ready-to-assign/`).
 *
 * Split out of `queries.ts`, which reads it for `loadBudget`; the Accounts page and Reconcile
 * read it on their own.
 */

/** Retained feed rows remain auditable in Register, but are not a second copy of the money. */
export function notSupersededPending(ids: readonly string[]) {
  return ids.length > 0 ? notInArray(financeTransactions.id, [...ids]) : undefined;
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
  const { accounts: allAccounts, pending } = await loadAccountsWithPending(
    userId,
    executor,
  );
  const accounts = allAccounts.filter((account) =>
    accountIds ? accountIds.includes(account.id) : !account.offBudget,
  );
  return positionBefore(userId, month, accounts, pending, executor);
}

/** {@link openingPositionFor} for a caller that already holds the accounts and the pending. */
export async function positionBefore(
  userId: string,
  month: MonthKey,
  accounts: readonly FinanceAccountRow[],
  pending: WorkingPendingSelection,
  executor: FinanceExecutor,
): Promise<number> {
  if (accounts.length === 0) return 0;
  const since = await movedSince(userId, month, pending, executor);
  return accounts.reduce(
    (total, account) => total + positionOf(account, pending, since),
    0,
  );
}

/** One account's working balance with everything dated after the cutoff walked back out. */
function positionOf(
  account: FinanceAccountRow,
  pending: WorkingPendingSelection,
  since: ReadonlyMap<string, number>,
): number {
  const terms = positionTermsOf(account, pending, since);
  return terms.workingCents - terms.sinceStartCents;
}

/** The two halves of {@link positionOf}, kept apart so a mismatch can show its working. */
function positionTermsOf(
  account: FinanceAccountRow,
  pending: WorkingPendingSelection,
  since: ReadonlyMap<string, number>,
): PositionTerms {
  return {
    workingCents: accountBalanceView(account, pending.rows).workingCents,
    // An account with no rows since the cutoff is absent from the grouped read: it moved 0.
    sinceStartCents: since.get(account.id) ?? 0,
  };
}

type PositionTerms = {
  /** Today's working balance: the bank's posted figure plus the pending it counts. */
  workingCents: number;
  /** Signed sum of the register's money rows dated in the start month or later. */
  sinceStartCents: number;
};

/**
 * Signed money per account dated in `month` or later — what has to be walked back out of a
 * working balance to stand on the day before `month` began.
 *
 * Every account in one grouped read. Measuring the accounts one at a time, each with a read
 * of its own, is what this replaced: the per-account drift check issued six queries for
 * every seeded account, and all of them asked for the same rows.
 */
async function movedSince(
  userId: string,
  month: MonthKey,
  pending: WorkingPendingSelection,
  executor: FinanceExecutor,
): Promise<Map<string, number>> {
  const asOfKey = monthEndKey(shiftMonthKey(month, -1));
  const rows = await executor
    .select({
      accountId: financeTransactions.accountId,
      amount: sql<string>`coalesce(sum(${financeTransactions.amount}), 0)`,
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
    )
    .groupBy(financeTransactions.accountId);

  return new Map(
    rows.map((row) => [row.accountId, numericStringToCents(row.amount) ?? 0]),
  );
}

export type AccountMismatch = {
  accountId: string;
  accountName: string;
  /** Bank working balance − (recorded opening + rows since start). Zero means it matches. */
  mismatchCents: number;
  /**
   * The three terms `mismatchCents` is made of, so a page can show the subtraction rather
   * than only its answer — the same reason `BudgetMonth.terms` exists.
   * `workingCents − openingCents − sinceStartCents === mismatchCents`, always.
   */
  workingCents: number;
  openingCents: number;
  sinceStartCents: number;
};

export type BudgetMismatch = {
  accounts: readonly AccountMismatch[];
  unmatchedTransferCents: number;
};

/**
 * D3: how far each on-budget account's live position has drifted from its recorded opening,
 * and the net of on-budget transfer-flow rows that have not been paired off since the start
 * month. Both are warnings, never Ready to Assign terms — Reconcile (`reconcileAccount`)
 * is the only deliberate way either moves RTA.
 *
 * Per account, `mismatchCents` is `openingPositionFor(…, [accountId]) − budgetOpeningCents`:
 * `openingPositionFor` is `working − rows since start`, so subtracting the recorded opening
 * from it is exactly `working − (opening + rows since start)`, D3's own formula, rearranged
 * to reuse the query that already computes the live half of it.
 *
 * Unseeded accounts (`budget_opening_cents` still null) are left out — there is no recorded
 * opening yet to have drifted from, and every account is unseeded until Task 8's cutover
 * runs (`effectiveOpeningCents`'s rollout note in the ledger-rta spec).
 */
export async function loadBudgetMismatch(
  userId: string,
  startMonth: MonthKey | null,
  executor: FinanceExecutor = db,
): Promise<BudgetMismatch> {
  if (!startMonth) return { accounts: [], unmatchedTransferCents: 0 };

  // The drift waits on the accounts and the pending decision, but not on the recorded
  // openings — so those are read beside it rather than in front of it.
  const loaded = loadAccountsWithPending(userId, executor);
  const [{ accounts }, openings, drift] = await Promise.all([
    loaded,
    recordedOpeningsOf(userId, executor),
    loaded.then(({ accounts, pending }) =>
      liveDriftSince(userId, startMonth, accounts, pending, executor),
    ),
  ]);
  return budgetMismatchOf(accounts, openings, drift);
}

type RecordedOpening = {
  id: string;
  offBudget: boolean;
  budgetOpeningCents: number | null;
};

export function recordedOpeningsOf(
  userId: string,
  executor: FinanceExecutor,
): Promise<RecordedOpening[]> {
  return executor
    .select({
      id: financeAccounts.id,
      offBudget: financeAccounts.offBudget,
      budgetOpeningCents: financeAccounts.budgetOpeningCents,
    })
    .from(financeAccounts)
    .where(eq(financeAccounts.userId, userId));
}

type LiveDrift = {
  /** Each account's working balance and rows since the start month, keyed by account id. */
  termsByAccount: Map<string, PositionTerms>;
  unmatchedTransferCents: number;
};

/** The two reads {@link loadBudgetMismatch} is made of, for a caller holding the rest. */
export async function liveDriftSince(
  userId: string,
  startMonth: MonthKey,
  accounts: readonly FinanceAccountRow[],
  pending: WorkingPendingSelection,
  executor: FinanceExecutor,
): Promise<LiveDrift> {
  const [since, transferRows] = await Promise.all([
    movedSince(userId, startMonth, pending, executor),
    executor
      .select({ amount: financeTransactions.amount })
      .from(financeTransactions)
      .innerJoin(financeAccounts, eq(financeAccounts.id, financeTransactions.accountId))
      .where(
        and(
          eq(financeTransactions.userId, userId),
          eq(financeAccounts.userId, userId),
          eq(financeAccounts.offBudget, false),
          moneyRows,
          notSupersededPending(pending.supersededTransactionIds),
          gte(financeTransactions.transactionDate, startMonth),
          sql`(${financeTransactions.transferGroupId} is not null or coalesce(${financeTransactions.flowOverride}::text, ${financeTransactions.derivedFlow}::text, '') = 'internal_transfer')`,
        ),
      ),
  ]);

  return {
    termsByAccount: new Map(
      accounts.map((account) => [account.id, positionTermsOf(account, pending, since)]),
    ),
    unmatchedTransferCents: unmatchedTransferCents(
      transferRows.map((row) => ({
        amountCents: numericStringToCents(row.amount) ?? 0,
      })),
    ),
  };
}

export function budgetMismatchOf(
  accounts: readonly FinanceAccountRow[],
  openings: readonly RecordedOpening[],
  drift: LiveDrift,
): BudgetMismatch {
  const openingById = new Map(openings.map((row) => [row.id, row]));
  return {
    accounts: accounts.flatMap((account): AccountMismatch[] => {
      const opening = openingById.get(account.id);
      if (!opening || opening.offBudget || opening.budgetOpeningCents === null) {
        return [];
      }
      const terms = drift.termsByAccount.get(account.id);
      if (!terms) {
        throw new Error(`liveDriftSince was not given account ${account.id}`);
      }
      return [
        {
          accountId: account.id,
          accountName: account.name,
          mismatchCents:
            terms.workingCents - terms.sinceStartCents - opening.budgetOpeningCents,
          workingCents: terms.workingCents,
          openingCents: opening.budgetOpeningCents,
          sinceStartCents: terms.sinceStartCents,
        },
      ];
    }),
    unmatchedTransferCents: drift.unmatchedTransferCents,
  };
}
